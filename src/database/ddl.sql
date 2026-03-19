-- =======================================================
-- FILE: ddl.sql
-- PROGETTO: RinascitaDigitale
-- =======================================================

-- 1. Creazione Database (Se non esiste)
CREATE DATABASE IF NOT EXISTS rinascita_digitale
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE rinascita_digitale;

-- Pulizia preventiva (utile se devi resettare tutto)
DROP TABLE IF EXISTS candidatura;
DROP TABLE IF EXISTS donazione;
DROP TABLE IF EXISTS richiesta;
DROP TABLE IF EXISTS utente;
DROP TABLE IF EXISTS ente;

-- ==========================================
-- 2. Tabella Enti (GESTITA MANUALMENTE DALL'ADMIN)
-- Gli enti NON possono registrarsi autonomamente.
-- Le credenziali vengono inserite direttamente nel DB dall'amministratore.
-- ==========================================
CREATE TABLE ente (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    nome_ente VARCHAR(200) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    zona_competenza VARCHAR(100),
    telefono VARCHAR(30),
    indirizzo VARCHAR(255),
    data_inserimento TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ==========================================
-- 3. Tabella Utenti (registrazione autonoma)
-- Ruoli ammessi: 'VOLONTARIO', 'DONATORE', 'CITTADINO'
-- (Gli enti sono nella tabella 'ente', non qui)
-- ==========================================
CREATE TABLE utente (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    cognome VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,

    ruolo ENUM('VOLONTARIO','DONATORE','CITTADINO') NOT NULL,

    -- Campi specifici opzionali
    skills_volontario TEXT,          -- Solo per Volontario

    data_registrazione TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ==========================================
-- 4. Tabella Richieste (Emergenze)
-- ==========================================
CREATE TABLE richiesta (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    titolo VARCHAR(200) NOT NULL,
    descrizione TEXT NOT NULL,
    zona VARCHAR(100) NOT NULL,

    priorita ENUM('ALTA','MEDIA','BASSA'),

    stato ENUM('IN_ATTESA','APERTA','RIFIUTATA','IN_CORSO','CHIUSA') DEFAULT 'IN_ATTESA',

    data_scadenza DATE,
    data_creazione TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- creato_da_id: se creata da cittadino → utente.id
    creato_da_id BIGINT,
    -- validato_da_ente_id: l'ente che valida → ente.id
    validato_da_ente_id BIGINT,

    FOREIGN KEY (creato_da_id) REFERENCES utente(id) ON DELETE CASCADE,
    FOREIGN KEY (validato_da_ente_id) REFERENCES ente(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ==========================================
-- 5. Tabella Donazioni
-- ==========================================
CREATE TABLE donazione (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    nome_bene VARCHAR(200) NOT NULL,
    categoria ENUM('CIBO','FARMACI','VESTIARIO') NOT NULL,
    quantita INT NOT NULL,
    data_scadenza_bene DATE,
    data_donazione TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    donatore_id BIGINT NOT NULL,
    FOREIGN KEY (donatore_id) REFERENCES utente(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ==========================================
-- 6. Tabella Candidature (Matching)
-- ==========================================
CREATE TABLE candidatura (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    data_candidatura TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    stato ENUM('IN_ATTESA','ACCETTATA','RIFIUTATA') DEFAULT 'IN_ATTESA',

    volontario_id BIGINT NOT NULL,
    richiesta_id BIGINT NOT NULL,

    FOREIGN KEY (volontario_id) REFERENCES utente(id) ON DELETE CASCADE,
    FOREIGN KEY (richiesta_id) REFERENCES richiesta(id) ON DELETE CASCADE,

    UNIQUE(volontario_id, richiesta_id)
) ENGINE=InnoDB;

-- ==========================================
-- 7. DATI DI PROVA (MOCK DATA)
-- ==========================================

-- ── ENTE inserito manualmente dall'admin ──
-- Password originale: 'admin' → hash bcrypt
INSERT INTO ente (nome_ente, email, password, zona_competenza)
VALUES ('Protezione Civile Salerno', 'ente@test.it', '$2b$10$F2FwGpHxCgnlC5b8JCRWc.AfBE4ECYTRXTNN98Vubn34vOXvbXJ1e', 'Salerno');

-- ── Utenti che si registrano autonomamente ──
-- Password originale: '1234' → hash bcrypt
INSERT INTO utente (nome, cognome, email, password, ruolo, skills_volontario)
VALUES ('Luigi', 'Verdi', 'volontario@test.it', '$2b$10$oEMnS.Sajpehl92m7ThDXeB8VrOrB7.BjgxqyxFDiN3Uiz561Aowm', 'VOLONTARIO', 'Primo Soccorso');

INSERT INTO utente (nome, cognome, email, password, ruolo)
VALUES ('Giulia', 'Bianchi', 'donatore@test.it', '$2b$10$oEMnS.Sajpehl92m7ThDXeB8VrOrB7.BjgxqyxFDiN3Uiz561Aowm', 'DONATORE');

INSERT INTO utente (nome, cognome, email, password, ruolo)
VALUES ('Anna', 'Neri', 'cittadino@test.it', '$2b$10$oEMnS.Sajpehl92m7ThDXeB8VrOrB7.BjgxqyxFDiN3Uiz561Aowm', 'CITTADINO');

-- Segnalazione Cittadino (IN_ATTESA di validazione)
INSERT INTO richiesta (titolo, descrizione, zona, stato, creato_da_id)
VALUES ('Tombino aperto', 'Buco pericoloso in strada', 'Pastena', 'IN_ATTESA', 3);
