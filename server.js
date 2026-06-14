require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const { Pool } = require('pg');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection
const pool = new Pool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
});

// Initialize tables on startup
async function initDatabase() {
    try {
        const sql = fs.readFileSync(path.join(__dirname, 'db', 'init.sql'), 'utf8');
        await pool.query(sql);
        console.log('✅ Database tables ready');
    } catch (err) {
        console.error('DB init error:', err.message);
    }
}

pool.connect(async (err) => {
    if (err) console.error('❌ DB connection error:', err.message);
    else {
        console.log('✅ PostgreSQL connected');
        await initDatabase();
    }
});

// Middleware – increase limit for Base64 images
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Session for admin
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 3600000 }
}));

// Make pool accessible in routes
app.use((req, res, next) => {
    req.pool = pool;
    next();
});

// Routes
const authRoutes = require('./routes/auth')(pool);
const categoryRoutes = require('./routes/categories')(pool);
const productRoutes = require('./routes/products')(pool);
const orderRoutes = require('./routes/orders')(pool);

app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);

// HTML pages
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));

app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`📱 Customer menu: http://localhost:${PORT}`);
    console.log(`🔐 Admin login: http://localhost:${PORT}/login`);
});