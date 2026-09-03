# Migrazione su Cloudflare — guida passo passo

Questa cartella contiene il configuratore pronto per **Cloudflare Pages**.
Il progetto Netlify resta intatto: finché non completi questi passi, il sito attuale
continua a funzionare com'è.

## Cosa cambia rispetto a Netlify

| | Netlify | Cloudflare |
|---|---|---|
| Sito | Netlify | **Pages** |
| Function | `/.netlify/functions/…` | **Pages Functions** su `/api/…` |
| Catalogo | Netlify Blobs | **Workers KV** |
| Configurazioni salvate | Netlify Blobs | **D1** (database SQLite) |

La logica di Odoo è identica. Il numero di serie delle configurazioni ora è generato
dal database, quindi non può più capitare che due salvataggi ricevano lo stesso numero.

## Struttura dei file

```
index.html          ← il configuratore (già aggiornato con gli indirizzi /api/)
catalog.json        ← catalogo di riserva
schema.sql          ← struttura del database D1
functions/
  _lib/odoo.js      ← helper condivisi (non è una rotta pubblica)
  api/
    get-catalog.js      →  /api/get-catalog
    save-catalog.js     →  /api/save-catalog
    get-config.js       →  /api/get-config
    save-config.js      →  /api/save-config
    odoo-quote.js       →  /api/odoo-quote
    odoo-prices.js      →  /api/odoo-prices
```

Il percorso del file determina l'indirizzo: `functions/api/odoo-quote.js` risponde
su `/api/odoo-quote`. Non serve alcuna configurazione di routing.

---

## 1. Metti i file su GitHub

Puoi usare lo stesso repository (in una cartella o su un ramo separato) oppure crearne
uno nuovo — più pulito, e non tocchi la versione Netlify funzionante.

I file di questa cartella vanno nella **radice** del repository.

## 2. Crea il progetto Pages

Nella dashboard Cloudflare: **Workers & Pages → Create → Pages → Connect to Git**,
scegli il repository e conferma.

Nelle impostazioni di build lascia tutto vuoto:

- Framework preset: **None**
- Build command: *(vuoto)*
- Build output directory: **/** (la radice)

È un sito statico: non c'è nulla da compilare.

## 3. Crea lo spazio KV per il catalogo

**Workers & Pages → KV → Create a namespace**, chiamalo per esempio `nseled-catalog`.

Poi nel progetto Pages: **Settings → Bindings → Add → KV namespace**

- Variable name: **`CATALOG`** ← deve essere esattamente questo
- KV namespace: quello appena creato

## 4. Crea il database D1 per le configurazioni

**Storage & Databases → D1 → Create**, chiamalo per esempio `nseled-config`.

Apri la **Console** del database e incolla il contenuto di `schema.sql`, poi esegui.
Crea la tabella `configs`.

Poi nel progetto Pages: **Settings → Bindings → Add → D1 database**

- Variable name: **`DB`** ← deve essere esattamente questo
- Database: quello appena creato

## 5. Imposta le variabili

**Settings → Variables and Secrets**. Quelle contrassegnate come *segreto* vanno
inserite come **Secret**, non come testo normale.

| Nome | Valore | Tipo |
|---|---|---|
| `ODOO_URL` | `https://nseled-europe.odoo.com` | testo |
| `ODOO_DB` | `nseled-europe` | testo |
| `ODOO_LOGIN` | la tua email Odoo | testo |
| `ODOO_API_KEY` | la API key di Odoo | **segreto** |
| `ODOO_PARTNER_NAME` | `Cliente da definire` | testo |
| `ODOO_OBJECT_FIELD` | `x_studio_oggetto` | testo |
| `ADMIN_TOKEN` | il token per salvare il catalogo | **segreto** |

Sono le stesse che avevi su Netlify: puoi rileggerle da lì prima di dismetterlo.

**Importante:** dopo aver aggiunto variabili o binding serve un nuovo deploy perché
diventino attivi (**Deployments → Retry deployment**).

## 6. Porta il catalogo sul nuovo sito

Il catalogo vive nello storage, non nel codice: va ricaricato una volta.

1. Apri il **vecchio** sito Netlify, entra nel pannello Amministrazione ed **esporta il catalog.json**.
2. Apri il **nuovo** sito Cloudflare (`…pages.dev`), pannello Amministrazione, **importa** quel file.
3. Premi **Salva sul sito** e inserisci l'`ADMIN_TOKEN`.

Le configurazioni salvate (CFG-xxxx) **non migrano**: restano su Netlify. I numeri sul
nuovo sistema ripartiranno da CFG-0001. Se ti serve conservarle, dimmelo prima di
dismettere Netlify.

## 7. Collega il dominio

**Custom domains → Set up a custom domain**. Il DNS di nseled.eu è già su Cloudflare,
quindi il collegamento è immediato e non devi toccare i record a mano.

Ricordati di aggiornare il percorso `/configuratore-dani` dove serve.

---

## Passo verticale (pixel rettangolare)

Nel pannello Amministrazione, ogni risoluzione ha tre campi: nome, **passo
orizzontale** e **passo verticale**. Il terzo si compila solo dove il pixel non
è quadrato — il Trasparent "INTERNO 3,91-7,82" ha 3,91 mm in orizzontale e 7,82
in verticale. Lasciato vuoto vale il passo orizzontale su tutti e due gli assi,
cioè il comportamento di sempre.

Non è un dettaglio estetico: senza quel dato l'altezza in pixel viene contata
col passo orizzontale e viene fuori il doppio dei pixel reali. Su una parete
5.000 × 3.000 mm a 2,8-5,6 la differenza è fra 1.786 × 1.071 px e i corretti
1.786 × 536 px — e da quel numero dipendono la scelta del controller, i
Megapixel dichiarati e la distanza di visione, che con un pixel rettangolare la
detta l'asse più grossolano.

Il dato vive nel catalogo, quindi lo scrivi qui una volta sola: la versione
agenti legge lo stesso archivio e lo prende da sé.

## Verifica finale

Apri il sito e controlla, nell'ordine:

1. Il configuratore si apre e compone le pareti (funziona anche senza server).
2. Il pannello Amministrazione salva sul sito → **KV funziona**.
3. Salvi una configurazione e ottieni un CFG → **D1 funziona**.
4. Riapri quel CFG dal campo "Richiama configurazione" → **lettura D1 funziona**.
5. Invii un'offerta a Odoo → **connettore funziona**.

## Limiti del piano gratuito

Per il tuo uso hai un margine molto ampio: 100.000 richieste al giorno per le function,
100.000 letture e 1.000 scritture al giorno su KV, 500 build al mese.

Un punto da tenere d'occhio, in trasparenza: le function gratuite hanno un tetto di
**10 ms di CPU per invocazione**. L'invio a Odoo con le due schede PNG allegate elabora
immagini in base64 piuttosto pesanti e, in teoria, potrebbe avvicinarsi a quel limite.
Se un giorno l'invio fallisse con un errore di CPU o timeout, la soluzione è ridurre la
risoluzione delle schede allegate — non è un problema di architettura ma di dimensione
del payload. Il resto delle operazioni è ampiamente sotto soglia.
