require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'u966260443_facerecog',
    password: process.env.DB_PASSWORD || 'Makelabs@123',
    database: process.env.DB_NAME || 'u966260443_facerecog',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = pool;
