# ZEIT // Niklas Fritsch (zeit.niklasfritsch.de)

Minimalistisches Web-Time-Tracking-Tool nach den Designprinzipien von **Dieter Rams (Braun)** und der funktionalen Einfachheit des **Lemon Timetrackers**.

## Features
- **Keine Datenbank nötig (Zero-Backend)**: Alle Einträge, Projekte, Tags und Filter werden lokal im Browser (`localStorage`) gespeichert.
- **Portabilität (Gerätewechsel)**: Vollständiger **JSON-Export & Import** direkt im Header sowie **CSV-Export** für Buchhaltung und Excel.
- **Smart Command Input**: Schnelleingabe via `@Projekt #Tag Beschreibung 1:30` (inkl. Autocomplete) oder Klick auf die Pastell-Chips.
- **Live-Stoppuhr & Tages-Logbuch**: Laufende Timer im Browser-Tab-Titel sichtbar, direktes Fortsetzen alter Einträge mit einem Klick.
- **Reports & Statistik**: Filterbare Berichte (inkl. Dezimalstunden für Rechnungen) sowie Balken- und Kreisdiagramme (Average Week, Overall History, Project Usage, Tag Usage).

---

## Schnellstart mit Docker Compose (Port 8321)

Das Projekt nutzt Next.js mit `output: 'standalone'` und ist komplett für Docker vorkonfiguriert:

```bash
docker compose up -d --build
```

Danach läuft die Anwendung auf **http://localhost:8321** und kann über einen Reverse Proxy (Nginx, Caddy, Traefik) direkt auf https://zeit.niklasfritsch.de geroutet werden.

### Beispiel Reverse-Proxy (Caddyfile)
```caddy
zeit.niklasfritsch.de {
    reverse_proxy localhost:8321
}
```

### Beispiel Reverse-Proxy (Nginx)
```nginx
server {
    listen 80;
    server_name zeit.niklasfritsch.de;

    location / {
        proxy_pass http://127.0.0.1:8321;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## Lokale Entwicklung (ohne Docker)
```bash
npm install
npm run dev
```
