module.exports = (pool) => {
    const express = require('express');
    const router = express.Router();

    function isAdmin(req, res, next) {
        if (req.session.isAdmin) return next();
        res.status(403).json({ error: 'Unauthorized' });
    }

    // Get all categories
    router.get('/', async (req, res) => {
        try {
            const result = await pool.query('SELECT * FROM categories ORDER BY id');
            res.json(result.rows);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Create category (admin)
    router.post('/', isAdmin, async (req, res) => {
        const { name } = req.body;
        try {
            const result = await pool.query('INSERT INTO categories (name) VALUES ($1) RETURNING *', [name]);
            res.json(result.rows[0]);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Delete category
    router.delete('/:id', isAdmin, async (req, res) => {
        const { id } = req.params;
        try {
            await pool.query('DELETE FROM categories WHERE id = $1', [id]);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};