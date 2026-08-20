Budget Tracker — CLAUDE.md
Panoramica del progetto
Web app multi-utente per il monitoraggio delle finanze personali: ogni utente crea un proprio account, fa un breve onboarding iniziale, poi inserisce spese/entrate, filtra per periodo/categoria/conto e riceve alert automatici.
Stack tecnico

* Frontend: HTML/CSS/JavaScript vanilla, nessun build step. Grafici con Chart.js caricato da CDN.
* Backend: Cloudflare Pages Functions (cartella `/functions`) come API serverless.
* Database: Cloudflare D1 (SQLite serverless)
   * Binding: `DB`
   * database_name: `budget-tracker-db`
   * database_id: `7212e3d7-7de2-45a3-8637-c049b4803b25`
* Hosting: Cloudflare Pages collegato al repo GitHub (deploy automatico ad ogni push su `main`), dominio custom collegato.

Autenticazione

* Ogni utente ha un account con email + password.
* Password hashate con PBKDF2 via Web Crypto API (nativa nei Workers, nessuna libreria esterna necessaria) + salt casuale per utente, salvati separati (`password_hash`, `password_salt`).
* Sessione gestita con un token in `sessions`, esposto al client come cookie `HttpOnly`, `Secure`, con scadenza (`expires_at`).
* Ogni riga di `accounts`, `categories`, `transactions` è legata a `user_id`: tutte le query devono filtrare esplicitamente per l'utente loggato, MAI restituire dati di un altro utente.
* Cloudflare Access non è usato per il login (è pensato per allowlist note, non per signup pubblico) — può eventualmente essere aggiunto in futuro come ulteriore livello se si vuole restringere l'accesso al dominio a persone note.

Onboarding (primo accesso dopo la registrazione)
Wizard breve mostrato una sola volta (`users.onboarding_completed = 0`):

1. Saldo attuale approssimativo → salvato in `users.initial_balance`
2. Hai uno stipendio/entrata fissa? Se sì: importo e frequenza → `users.has_salary`, `salary_amount`, `salary_frequency`
3. Creazione automatica di un conto di default ("Conto principale") in `accounts`
4. Pre-popolamento di categorie di base in `categories` (es. Stipendio, Affitto, Spesa, Trasporti, Bollette, Svago, Salute, Altro) associate al nuovo `user_id`
5. Al termine: `onboarding_completed = 1`, redirect alla dashboard

Schema del database

```sql
users(
  id, email, password_hash, password_salt,
  initial_balance, has_salary, salary_amount, salary_frequency,
  onboarding_completed, created_at
)
sessions(id, user_id, created_at, expires_at)
accounts(id, user_id, name, created_at)              -- UNIQUE(user_id, name)
categories(id, user_id, name, type)                  -- UNIQUE(user_id, name, type)
transactions(
  id, user_id, date, amount, type, category_id, account_id,
  description, is_recurring, recurrence_frequency, created_at
)

```

Indici su `transactions.date`, `transactions.category_id`, `transactions.user_id`.
Struttura cartelle prevista

```
/
├── index.html              # dashboard (richiede sessione valida)
├── login.html / signup.html
├── onboarding.html
├── /css
├── /js                     # logica frontend, fetch verso /api/*, conversione date
├── /functions
│   └── /api
│       ├── auth/
│       │   ├── signup.js
│       │   ├── login.js
│       │   └── logout.js
│       ├── onboarding.js
│       ├── transactions.js
│       ├── summary.js
│       ├── alerts.js
│       ├── accounts.js
│       └── categories.js
├── wrangler.toml
└── CLAUDE.md

```

Funzionalità chiave da costruire

1. Registrazione/login/logout con sessione via cookie
2. Onboarding come descritto sopra
3. Form di inserimento spesa/entrata (data, importo, categoria, conto, tipo, ricorrenza)
4. Filtri: trimestre corrente/precedente, semestre, anno, per categoria, per conto — con confronto tra periodi diversi
5. Dashboard con grafico a torta (per categoria) e a barre (andamento nel tempo)
6. Sistema di alert (per singolo utente):
   * spesa in una categoria superiore alla media dei mesi precedenti
   * spese ricorrenti in scadenza nei prossimi giorni
   * categorie dove si sta spendendo sopra il budget atteso
7. Gestione multi-conto per utente

Convenzioni

* Lingua interfaccia: italiano
* Valuta: EUR
* Date: salvate nel database in formato ISO (`YYYY-MM-DD`) — necessario per ordinamento e filtri per trimestre/semestre/anno via SQL. Mostrate e inserite dall'utente sempre in formato DD-MM-YYYY: la conversione tra i due formati avviene lato frontend (funzioni helper in `/js`, es. `toISO()` e `toDisplay()`).
* Importi sempre positivi; il segno entrata/uscita è dato dal campo `type`
* Preferire librerie via CDN a dipendenze npm, per restare senza build step

Sicurezza e privacy

* Repository GitHub privata
* Nessun segreto nel codice: variabili sensibili come variabili d'ambiente/secret di Cloudflare, mai committate
* Essendo un'app multi-utente con password e dati finanziari altrui, ogni endpoint API deve verificare la sessione prima di leggere/scrivere dati, e ogni query deve essere scoperta al `user_id` della sessione corrente
* Prevedere una funzione per l'utente di eliminare il proprio account e tutti i dati collegati

Comandi utili

* `wrangler pages dev .` — sviluppo locale con Functions e D1 collegati
* `wrangler d1 execute budget-tracker-db --command "SELECT * FROM users"` — query rapide da CLI
* Deploy: automatico via integrazione GitHub ↔ Cloudflare Pages ad ogni push

Nota sugli alert/consigli
Gli alert e i suggerimenti generati dall'app sono calcoli automatici basati sui dati storici inseriti dal singolo utente, non consulenza finanziaria professionale.

Note implementative

* Schema SQL completo in `schema.sql` (da applicare con `wrangler d1 execute budget-tracker-db --file=schema.sql --remote` e in locale con `--local`).
* Codice condiviso lato backend in `/functions/api/_lib` (hashing password, sessioni, risposte JSON, calcolo periodi). Le funzioni in `_lib` non sono esposte come route perché non esportano `onRequest*`.
* Alert "budget atteso"/"media dei mesi precedenti" sono calcolati confrontando la spesa del mese corrente per categoria con la media degli ultimi 3 mesi (nessuna tabella di budget dedicata nello schema attuale).
