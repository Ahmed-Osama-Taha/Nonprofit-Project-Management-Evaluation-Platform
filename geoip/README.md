# Offline IP geolocation database

Login-session geolocation is **fully offline**. The backend reads a local
MaxMind-format City database (`.mmdb`) that is **mounted** into the container at
`/geoip` — it makes **no outbound network calls** at any point. This is the
security-compliant / no-egress design: nothing about a user's IP ever leaves
your network.

## How to enable

1. Obtain a **City `.mmdb`** through your organisation's approved channel and
   place it in this folder as `GeoLite2-City.mmdb` (or set `GEOIP_DB_PATH` to
   whatever name you use). Both of these ship a compatible `.mmdb`:
   - **DB-IP IP-to-City Lite** — free, no account required (CC BY 4.0).
   - **MaxMind GeoLite2 City** — free with a MaxMind account.

   The file is downloaded **once, out-of-band, on an allowed machine**, then
   copied into this folder — the running backend never fetches it.

2. Rebuild/restart the backend so it picks up the file:

   ```bash
   docker compose up -d backend
   ```

3. Log out and back in — new sessions now show a coarse `City, Region, CC`
   location. Private / internal IPs still show **"Local network"**.

## IP intelligence (VPN / proxy / hosting / ISP)

To classify each IP as **VPN / public proxy / Tor / hosting-datacenter /
residential-ISP**, drop one or both of these into this folder (also offline
`.mmdb`, resolved in-process, no network):

- **`GeoLite2-ASN.mmdb`** — *free* (MaxMind account). Gives the ISP / AS
  organisation and lets us infer **hosting/datacenter vs residential** from the
  network name. Good baseline.
- **`GeoIP2-Anonymous-IP.mmdb`** — *paid* (MaxMind) or an equivalent IP2Location
  proxy DB. Gives **precise** `is_anonymous_vpn` / `is_public_proxy` /
  `is_tor_exit_node` / `is_hosting_provider` flags.

Set `GEOIP_ASN_DB_PATH` / `GEOIP_ANONYMOUS_DB_PATH` if you name them differently.
With neither present, network type reads "unknown" (no errors). A sign-in from a
VPN/proxy/hosting network is flagged **High** in the identity risk panel.

## If you leave this folder empty

Everything still works: public IPs simply have no location (blank), and
private/internal IPs show "Local network". No errors, no network calls.

## Notes

- The `.mmdb` file is **git-ignored** — do not commit it (licensing + size).
- Resolution covers **IPv4 and IPv6**.
- Raw IPs are only stored when `SESSION_STORE_IP=true`; the location label is
  derived and stored regardless (see backend config).
