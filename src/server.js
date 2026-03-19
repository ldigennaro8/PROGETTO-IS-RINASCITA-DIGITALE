/* ===================================================
   FILE: server.js
   PROGETTO: RinascitaDigitale – Backend API
   Avvio: node server.js   (porta 3000)
   =================================================== */

const express = require('express');
const mysql   = require('mysql2/promise');
const path    = require('path');
const cors    = require('cors');
const crypto  = require('crypto');
const bcrypt  = require('bcryptjs');

const BCRYPT_ROUNDS = 10;   // costo computazionale dell'hashing

const app  = express();
const PORT = 3000;

// ── Middleware ──────────────────────────────────────
app.use(cors());
app.use(express.json());

// Serve i file statici (HTML, CSS, JS, immagini) dalla root del progetto
app.use(express.static(path.join(__dirname)));

// ── Pool di connessione MySQL ──────────────────────
const pool = mysql.createPool({
    host:     'localhost',
    user:     'root',          // <-- cambia se usi un altro utente
    password: '',              // <-- inserisci la tua password MySQL
    database: 'rinascita_digitale',
    waitForConnections: true,
    connectionLimit: 10
});

// Verifica connessione all'avvio
(async () => {
    try {
        const conn = await pool.getConnection();
        console.log('✅  Connesso a MySQL – database rinascita_digitale');
        conn.release();
    } catch (err) {
        console.error('❌  Errore connessione MySQL:', err.message);
        console.error('    Assicurati che MySQL sia avviato e che il database "rinascita_digitale" esista.');
        console.error('    Esegui prima:  mysql -u root < database/ddl.sql');
    }
})();

// ═══════════════════════════════════════════════════
//  API – AUTENTICAZIONE
// ═══════════════════════════════════════════════════

// ── POST /api/register ─────────────────────────────
app.post('/api/register', async (req, res) => {
    try {
        const { nome, cognome, email, password, ruolo } = req.body;

        if (!nome || !cognome || !email || !password || !ruolo) {
            return res.status(400).json({ error: 'Tutti i campi sono obbligatori.' });
        }

        const ruoloUpper = ruolo.toUpperCase();

        // Gli enti NON possono registrarsi: le credenziali vengono inserite manualmente dall'admin
        if (ruoloUpper === 'ENTE') {
            return res.status(403).json({ error: 'Gli enti non possono registrarsi. Le credenziali vengono fornite dall\'amministratore.' });
        }

        const ruoliValidi = ['VOLONTARIO', 'DONATORE', 'CITTADINO'];
        if (!ruoliValidi.includes(ruoloUpper)) {
            return res.status(400).json({ error: 'Ruolo non valido.' });
        }

        // Controlla se l'email esiste già
        const [existing] = await pool.query('SELECT id FROM utente WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(409).json({ error: 'Email già registrata.' });
        }

        // Hash della password con bcrypt prima di salvarla
        const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

        // Inserisci nel database (password crittografata)
        const [result] = await pool.query(
            'INSERT INTO utente (nome, cognome, email, password, ruolo) VALUES (?, ?, ?, ?, ?)',
            [nome, cognome, email, hashedPassword, ruoloUpper]
        );

        // Mappa il ruolo alla dashboard
        const dashboardMap = {
            'CITTADINO':  'dashboard-cittadino.html',
            'ENTE':       'dashboard-ente.html',
            'VOLONTARIO': 'dashboard-volontario.html',
            'DONATORE':   'dashboard-donatore.html'
        };

        res.status(201).json({
            success: true,
            utente: {
                id: result.insertId,
                nome,
                cognome,
                email,
                ruolo: ruoloUpper
            },
            redirect: dashboardMap[ruoloUpper]
        });

    } catch (err) {
        console.error('Errore registrazione:', err);
        res.status(500).json({ error: 'Errore interno del server.' });
    }
});

// ── POST /api/login ────────────────────────────────
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email e password sono obbligatori.' });
        }

        // 0) Admin hardcoded
        if (email === 'admin@rinascita.it' && password === 'Admin123!') {
            return res.json({
                success: true,
                utente: { id: 0, nome: 'Admin', cognome: '', email: 'admin@rinascita.it', ruolo: 'ADMIN' },
                redirect: 'dashboard-admin.html'
            });
        }

        // 1) Cerca prima nella tabella utente (cittadini, volontari, donatori)
        const [rows] = await pool.query(
            'SELECT id, nome, cognome, email, password, ruolo FROM utente WHERE email = ?',
            [email]
        );

        if (rows.length > 0) {
            // Confronta la password in chiaro con l'hash salvato nel DB
            const match = await bcrypt.compare(password, rows[0].password);
            if (!match) {
                return res.status(401).json({ error: 'Credenziali non valide.' });
            }
        }

        // 2) Se non trovato come utente, cerca nella tabella ente
        if (rows.length === 0) {
            const [entiRows] = await pool.query(
                'SELECT id, nome_ente, email, password FROM ente WHERE email = ?',
                [email]
            );

            if (entiRows.length === 0) {
                return res.status(401).json({ error: 'Credenziali non valide.' });
            }

            // Confronta password con hash dell'ente
            const matchEnte = await bcrypt.compare(password, entiRows[0].password);
            if (!matchEnte) {
                return res.status(401).json({ error: 'Credenziali non valide.' });
            }

            const ente = entiRows[0];
            return res.json({
                success: true,
                utente: {
                    id: ente.id,
                    nome: ente.nome_ente,
                    cognome: '',
                    email: ente.email,
                    ruolo: 'ENTE'
                },
                redirect: 'dashboard-ente.html'
            });
        }

        const utente = rows[0];

        const dashboardMap = {
            'CITTADINO':  'dashboard-cittadino.html',
            'ENTE':       'dashboard-ente.html',
            'VOLONTARIO': 'dashboard-volontario.html',
            'DONATORE':   'dashboard-donatore.html'
        };

        res.json({
            success: true,
            utente: {
                id: utente.id,
                nome: utente.nome,
                cognome: utente.cognome,
                email: utente.email,
                ruolo: utente.ruolo
            },
            redirect: dashboardMap[utente.ruolo]
        });

    } catch (err) {
        console.error('Errore login:', err);
        res.status(500).json({ error: 'Errore interno del server.' });
    }
});

// ═══════════════════════════════════════════════════
//  API – RICHIESTE / SEGNALAZIONI
// ═══════════════════════════════════════════════════

// ── GET /api/richieste ─────────────────────────────
// Opzionale query: ?stato=IN_ATTESA  oppure  ?creato_da=<id>
app.get('/api/richieste', async (req, res) => {
    try {
        let query = `SELECT r.*, u.nome AS creatore_nome, u.cognome AS creatore_cognome,
                     (SELECT COUNT(*) FROM candidatura c WHERE c.richiesta_id = r.id) as num_candidature
                     FROM richiesta r LEFT JOIN utente u ON r.creato_da_id = u.id`;
        const params = [];
        const conditions = [];

        if (req.query.stato) {
            conditions.push('r.stato = ?');
            params.push(req.query.stato.toUpperCase());
        }
        if (req.query.creato_da) {
            conditions.push('r.creato_da_id = ?');
            params.push(req.query.creato_da);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        query += ' ORDER BY r.data_creazione DESC';

        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error('Errore GET richieste:', err);
        res.status(500).json({ error: 'Errore interno.' });
    }
});

// ── POST /api/richieste ────────────────────────────
app.post('/api/richieste', async (req, res) => {
    try {
        const { titolo, descrizione, zona, creato_da_id, priorita, stato } = req.body;

        if (!titolo || !descrizione || !zona || !creato_da_id) {
            return res.status(400).json({ error: 'Campi obbligatori mancanti.' });
        }

        const statoFinale = stato || 'IN_ATTESA';
        const [result] = await pool.query(
            'INSERT INTO richiesta (titolo, descrizione, zona, priorita, stato, creato_da_id) VALUES (?, ?, ?, ?, ?, ?)',
            [titolo, descrizione || '', zona, priorita || null, statoFinale, creato_da_id]
        );

        res.status(201).json({ success: true, id: result.insertId });
    } catch (err) {
        console.error('Errore POST richiesta:', err);
        res.status(500).json({ error: 'Errore interno.' });
    }
});

// ── PUT /api/richieste/:id ─────────────────────────
// Aggiorna stato e/o priorità (usato dall'Ente per approvare/rifiutare)
app.put('/api/richieste/:id', async (req, res) => {
    try {
        const { stato, priorita, validato_da_id } = req.body;
        const sets = [];
        const params = [];

        if (stato) { sets.push('stato = ?'); params.push(stato.toUpperCase()); }
        if (priorita) { sets.push('priorita = ?'); params.push(priorita.toUpperCase()); }
        if (validato_da_id) { sets.push('validato_da_ente_id = ?'); params.push(validato_da_id); }

        if (sets.length === 0) {
            return res.status(400).json({ error: 'Nessun campo da aggiornare.' });
        }

        params.push(req.params.id);
        await pool.query(`UPDATE richiesta SET ${sets.join(', ')} WHERE id = ?`, params);

        res.json({ success: true });
    } catch (err) {
        console.error('Errore PUT richiesta:', err);
        res.status(500).json({ error: 'Errore interno.' });
    }
});

// ═══════════════════════════════════════════════════
//  API – DONAZIONI
// ═══════════════════════════════════════════════════

// ── GET /api/donazioni?donatore_id=<id> ────────────
app.get('/api/donazioni', async (req, res) => {
    try {
        let query = 'SELECT * FROM donazione';
        const params = [];

        if (req.query.donatore_id) {
            query += ' WHERE donatore_id = ?';
            params.push(req.query.donatore_id);
        }
        query += ' ORDER BY data_donazione DESC';

        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error('Errore GET donazioni:', err);
        res.status(500).json({ error: 'Errore interno.' });
    }
});

// ── POST /api/donazioni ───────────────────────────
app.post('/api/donazioni', async (req, res) => {
    try {
        const { nome_bene, categoria, quantita, data_scadenza_bene, donatore_id } = req.body;

        if (!nome_bene || !categoria || !quantita || !donatore_id) {
            return res.status(400).json({ error: 'Campi obbligatori mancanti.' });
        }

        const [result] = await pool.query(
            'INSERT INTO donazione (nome_bene, categoria, quantita, data_scadenza_bene, donatore_id) VALUES (?, ?, ?, ?, ?)',
            [nome_bene, categoria.toUpperCase(), quantita, data_scadenza_bene || null, donatore_id]
        );

        res.status(201).json({ success: true, id: result.insertId });
    } catch (err) {
        console.error('Errore POST donazione:', err);
        res.status(500).json({ error: 'Errore interno.' });
    }
});

// ═══════════════════════════════════════════════════
//  API – CANDIDATURE
// ═══════════════════════════════════════════════════

// ── GET /api/candidature?volontario_id=<id> ────────
app.get('/api/candidature', async (req, res) => {
    try {
        let query = `SELECT c.*, r.titolo, r.zona, r.priorita, r.stato AS stato_richiesta
                     FROM candidatura c
                     JOIN richiesta r ON c.richiesta_id = r.id`;
        const params = [];

        if (req.query.volontario_id) {
            query += ' WHERE c.volontario_id = ?';
            params.push(req.query.volontario_id);
        }
        query += ' ORDER BY c.data_candidatura DESC';

        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error('Errore GET candidature:', err);
        res.status(500).json({ error: 'Errore interno.' });
    }
});

// ── POST /api/candidature ─────────────────────────
app.post('/api/candidature', async (req, res) => {
    try {
        const { volontario_id, richiesta_id } = req.body;

        if (!volontario_id || !richiesta_id) {
            return res.status(400).json({ error: 'volontario_id e richiesta_id sono obbligatori.' });
        }

        const [result] = await pool.query(
            'INSERT INTO candidatura (volontario_id, richiesta_id) VALUES (?, ?)',
            [volontario_id, richiesta_id]
        );

        res.status(201).json({ success: true, id: result.insertId });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Candidatura già esistente.' });
        }
        console.error('Errore POST candidatura:', err);
        res.status(500).json({ error: 'Errore interno.' });
    }
});

// ── PUT /api/candidature/:id ──────────────────────
app.put('/api/candidature/:id', async (req, res) => {
    try {
        const { stato } = req.body;
        if (!stato) {
            return res.status(400).json({ error: 'Campo stato obbligatorio.' });
        }

        await pool.query('UPDATE candidatura SET stato = ? WHERE id = ?', [stato.toUpperCase(), req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Errore PUT candidatura:', err);
        res.status(500).json({ error: 'Errore interno.' });
    }
});

// ═══════════════════════════════════════════════════
//  API – UTENTI (lettura)
// ═══════════════════════════════════════════════════
app.get('/api/utenti', async (req, res) => {
    try {
        let query = 'SELECT id, nome, cognome, email, ruolo, data_registrazione FROM utente';
        const params = [];

        if (req.query.ruolo) {
            query += ' WHERE ruolo = ?';
            params.push(req.query.ruolo.toUpperCase());
        }
        query += ' ORDER BY data_registrazione DESC';

        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error('Errore GET utenti:', err);
        res.status(500).json({ error: 'Errore interno.' });
    }
});

// ═══════════════════════════════════════════════════
//  API – DELETE (per Ente / Admin)
// ═══════════════════════════════════════════════════

// ── DELETE /api/utenti/:id ─────────────────────────
app.delete('/api/utenti/:id', async (req, res) => {
    try {
        const [result] = await pool.query('DELETE FROM utente WHERE id = ?', [req.params.id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Utente non trovato.' });
        res.json({ success: true });
    } catch (err) {
        console.error('Errore DELETE utente:', err);
        res.status(500).json({ error: 'Errore interno.' });
    }
});

// ── DELETE /api/richieste/:id ──────────────────────
app.delete('/api/richieste/:id', async (req, res) => {
    try {
        const [result] = await pool.query('DELETE FROM richiesta WHERE id = ?', [req.params.id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Richiesta non trovata.' });
        res.json({ success: true });
    } catch (err) {
        console.error('Errore DELETE richiesta:', err);
        res.status(500).json({ error: 'Errore interno.' });
    }
});

// ── DELETE /api/donazioni/:id ──────────────────────
app.delete('/api/donazioni/:id', async (req, res) => {
    try {
        const [result] = await pool.query('DELETE FROM donazione WHERE id = ?', [req.params.id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Donazione non trovata.' });
        res.json({ success: true });
    } catch (err) {
        console.error('Errore DELETE donazione:', err);
        res.status(500).json({ error: 'Errore interno.' });
    }
});

// ── DELETE /api/candidature/:id ────────────────────
app.delete('/api/candidature/:id', async (req, res) => {
    try {
        const [result] = await pool.query('DELETE FROM candidatura WHERE id = ?', [req.params.id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Candidatura non trovata.' });
        res.json({ success: true });
    } catch (err) {
        console.error('Errore DELETE candidatura:', err);
        res.status(500).json({ error: 'Errore interno.' });
    }
});

// ═══════════════════════════════════════════════════
//  API – ENTI (per Admin)
// ═══════════════════════════════════════════════════

// ── GET /api/enti ──────────────────────────────────
app.get('/api/enti', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, nome_ente, email, zona_competenza, telefono, indirizzo, data_inserimento FROM ente ORDER BY data_inserimento DESC');
        res.json(rows);
    } catch (err) {
        console.error('Errore GET enti:', err);
        res.status(500).json({ error: 'Errore interno.' });
    }
});

// ── POST /api/enti ─────────────────────────────────
app.post('/api/enti', async (req, res) => {
    try {
        const { nome_ente, email, password, zona_competenza, telefono, indirizzo } = req.body;
        if (!nome_ente || !email || !password) {
            return res.status(400).json({ error: 'Nome ente, email e password sono obbligatori.' });
        }

        // Controlla duplicato email
        const [existing] = await pool.query('SELECT id FROM ente WHERE email = ?', [email]);
        if (existing.length > 0) return res.status(409).json({ error: 'Email già registrata per un ente.' });

        // Hash della password dell'ente con bcrypt
        const hashedPwd = await bcrypt.hash(password, BCRYPT_ROUNDS);

        const [result] = await pool.query(
            'INSERT INTO ente (nome_ente, email, password, zona_competenza, telefono, indirizzo) VALUES (?, ?, ?, ?, ?, ?)',
            [nome_ente, email, hashedPwd, zona_competenza || null, telefono || null, indirizzo || null]
        );
        res.status(201).json({ success: true, id: result.insertId });
    } catch (err) {
        console.error('Errore POST ente:', err);
        res.status(500).json({ error: 'Errore interno.' });
    }
});

// ── DELETE /api/enti/:id ───────────────────────────
app.delete('/api/enti/:id', async (req, res) => {
    try {
        const [result] = await pool.query('DELETE FROM ente WHERE id = ?', [req.params.id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Ente non trovato.' });
        res.json({ success: true });
    } catch (err) {
        console.error('Errore DELETE ente:', err);
        res.status(500).json({ error: 'Errore interno.' });
    }
});

// ── GET /api/stats ─────────────────────────────────
// Panoramica generale per l'admin
app.get('/api/stats', async (req, res) => {
    try {
        const [[{totUtenti}]] = await pool.query('SELECT COUNT(*) as totUtenti FROM utente');
        const [[{totEnti}]] = await pool.query('SELECT COUNT(*) as totEnti FROM ente');
        const [[{totRichieste}]] = await pool.query('SELECT COUNT(*) as totRichieste FROM richiesta');
        const [[{totDonazioni}]] = await pool.query('SELECT COUNT(*) as totDonazioni FROM donazione');
        const [[{totCandidature}]] = await pool.query('SELECT COUNT(*) as totCandidature FROM candidatura');
        const [[{richiesteAperte}]] = await pool.query("SELECT COUNT(*) as richiesteAperte FROM richiesta WHERE stato = 'APERTA'");
        const [[{richiesteInAttesa}]] = await pool.query("SELECT COUNT(*) as richiesteInAttesa FROM richiesta WHERE stato = 'IN_ATTESA'");
        const [[{volontari}]] = await pool.query("SELECT COUNT(*) as volontari FROM utente WHERE ruolo = 'VOLONTARIO'");
        const [[{cittadini}]] = await pool.query("SELECT COUNT(*) as cittadini FROM utente WHERE ruolo = 'CITTADINO'");
        const [[{donatori}]] = await pool.query("SELECT COUNT(*) as donatori FROM utente WHERE ruolo = 'DONATORE'");

        res.json({ totUtenti, totEnti, totRichieste, totDonazioni, totCandidature, richiesteAperte, richiesteInAttesa, volontari, cittadini, donatori });
    } catch (err) {
        console.error('Errore GET stats:', err);
        res.status(500).json({ error: 'Errore interno.' });
    }
});

// ═══════════════════════════════════════════════════
//  API – PASSWORD RESET
// ═══════════════════════════════════════════════════

// Storage temporaneo dei token di reset (in produzione si userebbe Redis/DB)
const resetTokens = new Map(); // email -> { token, scadenza }

// ── POST /api/password-reset/request ───────────────
// Riceve l'email, genera un token e restituisce il link di reset
app.post('/api/password-reset/request', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: 'Email obbligatoria.' });
        }

        // Cerca l'email sia in utente che in ente
        const [utenti] = await pool.query('SELECT id, email FROM utente WHERE email = ?', [email]);
        const [enti] = await pool.query('SELECT id, email FROM ente WHERE email = ?', [email]);

        if (utenti.length === 0 && enti.length === 0) {
            return res.status(404).json({ success: false, error: 'Nessun account trovato con questa email.' });
        }

        // Genera token univoco
        const token = crypto.randomBytes(32).toString('hex');
        const scadenza = Date.now() + 3600000; // 1 ora
        resetTokens.set(email.toLowerCase(), { token, scadenza });

        // Link di reset
        const resetLink = `http://localhost:${PORT}/reset-password.html?token=${token}&email=${encodeURIComponent(email)}`;

        console.log(`🔑  Link di reset generato per ${email}: ${resetLink}`);

        res.json({
            success: true,
            resetLink: resetLink,
            message: 'Link di reset generato! Usalo per reimpostare la password.'
        });

    } catch (err) {
        console.error('Errore reset password:', err);
        res.status(500).json({ error: 'Errore interno del server.' });
    }
});

// ── POST /api/password-reset/confirm ───────────────
// Riceve token, email e nuova password
app.post('/api/password-reset/confirm', async (req, res) => {
    try {
        const { email, token, nuovaPassword } = req.body;

        if (!email || !token || !nuovaPassword) {
            return res.status(400).json({ error: 'Tutti i campi sono obbligatori.' });
        }

        const stored = resetTokens.get(email.toLowerCase());
        if (!stored || stored.token !== token || Date.now() > stored.scadenza) {
            return res.status(400).json({ error: 'Token non valido o scaduto. Richiedi un nuovo reset.' });
        }

        // Hash della nuova password prima di salvarla
        const hashedNewPwd = await bcrypt.hash(nuovaPassword, BCRYPT_ROUNDS);

        // Aggiorna password (crittografata) in utente o ente
        const [utenti] = await pool.query('SELECT id FROM utente WHERE email = ?', [email]);
        if (utenti.length > 0) {
            await pool.query('UPDATE utente SET password = ? WHERE email = ?', [hashedNewPwd, email]);
        } else {
            await pool.query('UPDATE ente SET password = ? WHERE email = ?', [hashedNewPwd, email]);
        }

        // Rimuovi il token usato
        resetTokens.delete(email.toLowerCase());

        res.json({ success: true, message: 'Password aggiornata con successo!' });

    } catch (err) {
        console.error('Errore reset password:', err);
        res.status(500).json({ error: 'Errore interno del server.' });
    }
});

// ═══════════════════════════════════════════════════
//  AVVIO SERVER
// ═══════════════════════════════════════════════════
app.listen(PORT, () => {
    console.log(`🚀  Server RinascitaDigitale avviato su http://localhost:${PORT}`);
    console.log(`    Apri il browser su http://localhost:${PORT}/index.html`);
});
