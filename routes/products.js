module.exports = (pool) => {
    const express = require('express');
    const router = express.Router();

    function isAdmin(req, res, next) {
        if (req.session.isAdmin) return next();
        res.status(403).json({ error: 'Unauthorized' });
    }

    // Get all products – sorted by sales (most popular first)
    router.get('/', async (req, res) => {
        try {
            const query = `
                SELECT p.*, c.name as category_name 
                FROM products p
                LEFT JOIN categories c ON p.category_id = c.id
                WHERE p.available = true
                ORDER BY p.sales_count DESC, p.id ASC
            `;
            const result = await pool.query(query);
            res.json(result.rows);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Create product – image_base64 is sent as data URL
    router.post('/', isAdmin, async (req, res) => {
        const { name, price, category_id, image_base64, available } = req.body;
        if (!name || !price || !category_id) {
            return res.status(400).json({ error: 'Missing name, price, or category' });
        }
        try {
            const result = await pool.query(
                `INSERT INTO products (name, price, category_id, image_url, available, sales_count)
                 VALUES ($1, $2, $3, $4, $5, 0) RETURNING *`,
                [name, price, category_id, image_base64 || null, available !== undefined ? available : true]
            );
            res.json(result.rows[0]);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: err.message });
        }
    });

    // Update product
    router.put('/:id', isAdmin, async (req, res) => {
        const { id } = req.params;
        const { name, price, category_id, image_base64, available } = req.body;
        try {
            const result = await pool.query(
                `UPDATE products SET name=$1, price=$2, category_id=$3, image_url=$4, available=$5
                 WHERE id=$6 RETURNING *`,
                [name, price, category_id, image_base64 || null, available, id]
            );
            res.json(result.rows[0]);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Delete product
    router.delete('/:id', isAdmin, async (req, res) => {
        const { id } = req.params;
        try {
            await pool.query('DELETE FROM products WHERE id = $1', [id]);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Increment sales (when order completed)
    router.post('/:id/increment-sales', isAdmin, async (req, res) => {
        const { id } = req.params;
        const { quantity } = req.body;
        try {
            await pool.query('UPDATE products SET sales_count = sales_count + $1 WHERE id = $2', [quantity || 1, id]);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};