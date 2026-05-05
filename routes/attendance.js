const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { requireAuth } = require('../middleware/auth');

// ── SHIFTS ────────────────────────────────────────────────────────────────────

// GET all shifts for logged-in user
router.get('/shifts', requireAuth, async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT * FROM attendance_shifts WHERE user_id = ? ORDER BY start_time',
            [req.session.userId]
        );
        res.json({ success: true, shifts: rows });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: 'Server error.' });
    }
});

// GET active shift based on current time
router.get('/shifts/active', requireAuth, async (req, res) => {
    try {
        const now  = new Date();
        const hhmm = now.toTimeString().slice(0, 5);
        const [rows] = await db.query(
            `SELECT * FROM attendance_shifts
             WHERE user_id = ? AND active = 1
               AND start_time <= ? AND end_time >= ?
             ORDER BY start_time LIMIT 1`,
            [req.session.userId, hhmm, hhmm]
        );
        res.json({ success: true, shift: rows[0] || null });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: 'Server error.' });
    }
});

// POST create shift
router.post('/shifts', requireAuth, async (req, res) => {
    try {
        const { name, start_time, end_time, max_students } = req.body;
        if (!name || !start_time || !end_time)
            return res.json({ success: false, message: 'Name, start time and end time are required.' });

        const [result] = await db.query(
            'INSERT INTO attendance_shifts (user_id, name, start_time, end_time, max_students) VALUES (?, ?, ?, ?, ?)',
            [req.session.userId, name, start_time, end_time, max_students || 0]
        );
        res.json({ success: true, shiftId: result.insertId, message: 'Shift created!' });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: 'Server error.' });
    }
});

// PUT update shift
router.put('/shifts/:id', requireAuth, async (req, res) => {
    try {
        const { name, start_time, end_time, max_students, active } = req.body;
        await db.query(
            'UPDATE attendance_shifts SET name=?, start_time=?, end_time=?, max_students=?, active=? WHERE id=? AND user_id=?',
            [name, start_time, end_time, max_students || 0, active ?? 1, req.params.id, req.session.userId]
        );
        res.json({ success: true, message: 'Shift updated!' });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: 'Server error.' });
    }
});

// DELETE shift
router.delete('/shifts/:id', requireAuth, async (req, res) => {
    try {
        await db.query(
            'DELETE FROM attendance_shifts WHERE id = ? AND user_id = ?',
            [req.params.id, req.session.userId]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: 'Server error.' });
    }
});

// ── ATTENDANCE RECORDS ────────────────────────────────────────────────────────

// POST mark attendance (called from recognize page on face recognition)
router.post('/mark', requireAuth, async (req, res) => {
    try {
        const { person_id, shift_id, confidence } = req.body;
        if (!person_id || !shift_id)
            return res.json({ success: false, message: 'person_id and shift_id required.' });

        // Verify person belongs to this user
        const [persons] = await db.query(
            'SELECT id, name FROM persons WHERE id = ? AND user_id = ?',
            [person_id, req.session.userId]
        );
        if (persons.length === 0)
            return res.json({ success: false, message: 'Person not found.' });

        // Verify shift belongs to this user
        const [shifts] = await db.query(
            'SELECT id, name, max_students FROM attendance_shifts WHERE id = ? AND user_id = ?',
            [shift_id, req.session.userId]
        );
        if (shifts.length === 0)
            return res.json({ success: false, message: 'Shift not found.' });

        const today = new Date().toISOString().slice(0, 10);

        // Check max_students cap
        if (shifts[0].max_students > 0) {
            const [countRows] = await db.query(
                'SELECT COUNT(*) as cnt FROM attendance_records WHERE shift_id = ? AND date = ?',
                [shift_id, today]
            );
            if (countRows[0].cnt >= shifts[0].max_students)
                return res.json({ success: false, message: 'Shift is full.', full: true });
        }

        // INSERT IGNORE prevents duplicate for same person+shift+date
        const [result] = await db.query(
            `INSERT IGNORE INTO attendance_records (user_id, person_id, shift_id, date, confidence)
             VALUES (?, ?, ?, ?, ?)`,
            [req.session.userId, person_id, shift_id, today, confidence || 0]
        );

        const alreadyMarked = result.affectedRows === 0;
        res.json({
            success: true,
            alreadyMarked,
            personName: persons[0].name,
            shiftName:  shifts[0].name,
            message: alreadyMarked
                ? `${persons[0].name} already marked for ${shifts[0].name}`
                : `Attendance marked: ${persons[0].name} — ${shifts[0].name}`
        });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: 'Server error.' });
    }
});

// GET attendance records with optional filters
router.get('/records', requireAuth, async (req, res) => {
    try {
        const { date, shift_id } = req.query;
        let sql = `
            SELECT ar.*, p.name as person_name, p.age, p.email, p.mobile,
                   s.name as shift_name, s.start_time, s.end_time
            FROM attendance_records ar
            JOIN persons p ON p.id = ar.person_id
            JOIN attendance_shifts s ON s.id = ar.shift_id
            WHERE ar.user_id = ?`;
        const params = [req.session.userId];
        if (date)     { sql += ' AND ar.date = ?';     params.push(date); }
        if (shift_id) { sql += ' AND ar.shift_id = ?'; params.push(shift_id); }
        sql += ' ORDER BY ar.marked_at DESC';

        const [rows] = await db.query(sql, params);
        res.json({ success: true, records: rows });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: 'Server error.' });
    }
});

// GET daily summary per shift
router.get('/summary', requireAuth, async (req, res) => {
    try {
        const date = req.query.date || new Date().toISOString().slice(0, 10);
        const [rows] = await db.query(
            `SELECT s.id, s.name, s.start_time, s.end_time, s.max_students,
                    COUNT(ar.id) as marked_count
             FROM attendance_shifts s
             LEFT JOIN attendance_records ar
               ON ar.shift_id = s.id AND ar.date = ? AND ar.user_id = ?
             WHERE s.user_id = ? AND s.active = 1
             GROUP BY s.id
             ORDER BY s.start_time`,
            [date, req.session.userId, req.session.userId]
        );
        res.json({ success: true, date, summary: rows });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: 'Server error.' });
    }
});

module.exports = router;
