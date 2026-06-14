module.exports = (pool) => {
    const express = require('express');
    const router = express.Router();
    const QRCode = require('qrcode');
    const crypto = require('crypto');

    function isAdmin(req, res, next) {
        if (req.session.isAdmin) return next();
        res.status(403).json({ error: 'Unauthorized' });
    }

    function generateOrderCode() {
        return 'ORD-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    }

    // Create order (customer)
    router.post('/', async (req, res) => {
        const { customer_name, items, payment_method, total_amount } = req.body;
        if (!items || items.length === 0) {
            return res.status(400).json({ error: 'Cart empty' });
        }

        const order_code = generateOrderCode();
        let status = payment_method === 'digital' ? 'paid' : 'pending_payment';
        let qr_code = null;

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            const today = new Date().toISOString().split('T')[0];
            const maxResult = await client.query(
                `SELECT COALESCE(MAX(daily_number), 0) as max_num FROM orders WHERE DATE(created_at) = $1`,
                [today]
            );
            const nextDailyNumber = maxResult.rows[0].max_num + 1;
            
            if (payment_method === 'digital') {
                qr_code = await QRCode.toDataURL(order_code);
            }

            const orderResult = await client.query(
                `INSERT INTO orders (order_code, customer_name, total_amount, payment_method, status, qr_code, daily_number)
                 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
                [order_code, customer_name || 'Guest', total_amount, payment_method, status, qr_code, nextDailyNumber]
            );
            const orderId = orderResult.rows[0].id;

            for (const item of items) {
                await client.query(
                    `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [orderId, item.product_id, item.name, item.quantity, item.price]
                );
            }
            await client.query('COMMIT');

            res.json({
                success: true,
                order_code,
                daily_number: nextDailyNumber,
                qr_code: qr_code,
                status: status,
                message: payment_method === 'digital' ? 'Order placed! QR code below.' : 'Order received. Wait for cash payment confirmation.'
            });
        } catch (err) {
            await client.query('ROLLBACK');
            console.error(err);
            res.status(500).json({ error: 'Order failed' });
        } finally {
            client.release();
        }
    });

    // Get order details by code (public)
    router.get('/track/:code', async (req, res) => {
        const { code } = req.params;
        try {
            const orderResult = await pool.query(
                'SELECT id, status, total_amount, payment_method, qr_code, daily_number FROM orders WHERE order_code = $1',
                [code]
            );
            if (orderResult.rows.length === 0) {
                return res.status(404).json({ error: 'Order not found' });
            }
            let order = orderResult.rows[0];
            if (order.status === 'paid' && !order.qr_code) {
                const qr = await QRCode.toDataURL(code);
                await pool.query('UPDATE orders SET qr_code = $1 WHERE id = $2', [qr, order.id]);
                order.qr_code = qr;
            }
            res.json({
                status: order.status,
                total_amount: order.total_amount,
                payment_method: order.payment_method,
                qr_code: order.qr_code,
                daily_number: order.daily_number
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Get all orders (admin) - newest first
    router.get('/', isAdmin, async (req, res) => {
        try {
            const query = `
                SELECT o.*, 
                       COALESCE(json_agg(json_build_object('product_name', oi.product_name, 'quantity', oi.quantity, 'unit_price', oi.unit_price)) 
                                FILTER (WHERE oi.id IS NOT NULL), '[]') as items
                FROM orders o
                LEFT JOIN order_items oi ON o.id = oi.order_id
                GROUP BY o.id
                ORDER BY o.created_at DESC
            `;
            const result = await pool.query(query);
            res.json(result.rows);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Update order status (admin)
    router.put('/:id/status', isAdmin, async (req, res) => {
        const { id } = req.params;
        const { status } = req.body;
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            const orderCheck = await client.query('SELECT order_code, payment_method, status FROM orders WHERE id = $1', [id]);
            if (orderCheck.rows.length === 0) throw new Error('Order not found');
            const order = orderCheck.rows[0];
            
            let qr_code = null;
            if (order.status === 'pending_payment' && status === 'paid' && order.payment_method === 'cash') {
                qr_code = await QRCode.toDataURL(order.order_code);
                await client.query('UPDATE orders SET qr_code = $1 WHERE id = $2', [qr_code, id]);
            }
            
            await client.query('UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2', [status, id]);

            if (status === 'completed') {
                const items = await client.query('SELECT product_id, quantity FROM order_items WHERE order_id = $1', [id]);
                for (const item of items.rows) {
                    if (item.product_id) {
                        await client.query('UPDATE products SET sales_count = sales_count + $1 WHERE id = $2', [item.quantity, item.product_id]);
                    }
                }
            }
            await client.query('COMMIT');
            res.json({ success: true, qr_code });
        } catch (err) {
            await client.query('ROLLBACK');
            console.error(err);
            res.status(500).json({ error: err.message });
        } finally {
            client.release();
        }
    });

    // Cancel order (admin) – NEW ROUTE
    router.put('/:id/cancel', isAdmin, async (req, res) => {
        const { id } = req.params;
        try {
            const order = await pool.query('SELECT status FROM orders WHERE id = $1', [id]);
            if (order.rows.length === 0) {
                return res.status(404).json({ error: 'Order not found' });
            }
            if (order.rows[0].status === 'completed') {
                return res.status(400).json({ error: 'Cannot cancel a completed order' });
            }
            await pool.query('UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2', ['cancelled', id]);
            res.json({ success: true });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: err.message });
        }
    });

    // Sales report (admin)
    router.get('/report', isAdmin, async (req, res) => {
        try {
            const result = await pool.query(`
                SELECT DATE(created_at) as day, COUNT(*) as orders, COALESCE(SUM(total_amount), 0) as revenue
                FROM orders
                WHERE status IN ('paid', 'completed')
                GROUP BY day ORDER BY day DESC LIMIT 7
            `);
            res.json(result.rows);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};