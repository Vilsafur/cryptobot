# 📈 Cryptobot

Un bot de trading simple et modulaire basé sur **Node.js + TypeScript**.  
Il se connecte à l’API **Kraken**, stocke les bougies 4h dans une base **SQLite**,  
et fournit des outils CLI pour la gestion, l’analyse et la visualisation.

---

## 🚀 Fonctionnalités

- Récupération automatique des bougies (4h) via l’API Kraken
- Stockage local en **SQLite**
- Gestion des **paires de trading** directement en base
  - Montant max à investir
  - Montant max par transaction
  - Take Profit
  - Stop Loss
- Scripts CLI :
  - `migrate` → crée/migre le schéma de la base
  - `purge` → supprime les vieilles données selon ta politique de rétention
  - `plot` → affiche un graphique ASCII des prix (Close) + moyennes mobiles + volume
- Journalisation configurable :
  - Console uniquement
  - Ou fichiers séparés (`logs/info.log` / `logs/error.log`)
- Intégration facile avec **systemd** (fetch au démarrage) et **cron** (purge régulière)

---

## 📂 Structure du projet

```
.
├── package.json
├── tsconfig.json
├── .env
├── .env.example
└── src
    ├── api
    │   └── kraken.ts         # Appels Kraken (OHLC, ticker…)
    ├── cli
    │   ├── index.ts          # Point d’entrée CLI principal
    │   ├── migrate.ts        # Migration DB
    │   ├── purge.ts          # Purge des données
    │   └── plot.ts           # Graphe ASCII (prix, MA, volume)
    ├── config.ts             # Centralisation de la configuration
    ├── db
    │   ├── candles.ts        # Gestion des bougies
    │   └── storage.ts        # Accès bas niveau SQLite
    ├── migration             # Fichiers de migration
    ├── strategy
    │   └── swing.ts          # Exemple de stratégie swing trading
    └── tools
        ├── logger.ts         # Logger (console/fichiers)
        └── riskManager.ts    # Gestion du risque (WIP)
```

---

## ⚙️ Installation

### Prérequis
- Node.js (installé via [`n`](https://github.com/tj/n))  
  ```bash
  npm install -g n
  n lts
  ```
- npm ou yarn
- SQLite (inclus par défaut avec Node via `better-sqlite3`)

### Installation des dépendances
```bash
npm install
```

---

## 🔑 Configuration

Copie le fichier `.env.example` vers `.env` et complète les valeurs :

```env
# Clés API Kraken (si besoin d’appels privés)
KRAKEN_API_KEY=xxx
KRAKEN_API_SECRET=xxx

# Logging
LOG_TO=console          # "console" ou "file"
LOG_DIR=./logs          # dossier logs si LOG_TO=file

# Base SQLite
DB_FILE=./data/cryptobot.db
```

💡 Les paires de trading (XBT/EUR, ETH/EUR, …) ne sont **pas** définies dans `.env`.  
Elles sont gérées en base via les migrations et les scripts.

---

## 🛠️ Utilisation

### 1. Initialiser la base
```bash
npm run migrate
```

### 2. Lancer le fetch en continu
Avec systemd (service au démarrage) :
```bash
sudo systemctl enable cryptobot-fetch.service
sudo systemctl start cryptobot-fetch.service
```

### 3. Purger régulièrement les anciennes données
Avec cron (exemple tous les jours à 3h) :
```cron
0 3 * * * /usr/bin/npm --prefix /chemin/vers/cryptobot run purge >> /chemin/vers/cryptobot/logs/cron.log 2>&1
```

### 4. Visualiser les données
```bash
npm run plot -- --pair XBT/EUR --days 14 --ma 42 --ma2 10
```

Affiche un graphe ASCII avec :
- Close (bleu)
- MA longue (vert)
- MA courte (rouge)
- Volume (bas du graphe)

---

## 📊 Exemple de graphe

```
=== Comment lire le graphe ===
- Bleu  : Close (prix de clôture des bougies 4h)
- Vert  : MA longue (42) → tendance de fond
- Rouge : MA courte (10) → tendance court terme

Achat : croisement MA courte au-dessus MA longue
Vente : croisement MA courte en-dessous MA longue
```

```
Close (blue), MA long (green), MA court (red):
  105263 ┤            ╭╮
  104714 ┤ ╭─╮        ││
  104165 ┤ │ │ ╭╮     ││
   ...   ┆ ...
```

---

## 📌 Roadmap

- [x] Stockage candles
- [x] Purge auto
- [x] Visualisation CLI
- [ ] Stratégie Swing Trading complète
- [ ] Gestion ordres Kraken (achat/vente réels)
- [ ] Backtesting
- [ ] Dashboard Web

---

## ⚖️ Licence

MIT © 2025  
Projet personnel de **Vilsafur**.
