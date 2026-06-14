module.exports = (pool) => {
    const express = require('express');
    const router = express.Router();

    router.post('/login', (req, res) => {
        const { username, password } = req.body;
        if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
            req.session.isAdmin = true;
            res.json({ success: true });
        } else {
            res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
    });

    router.post('/logout', (req, res) => {
        req.session.destroy();
        res.json({ success: true });
    });

    router.get('/check', (req, res) => {
        res.json({ isAdmin: !!req.session.isAdmin });
    });

    return router;
};