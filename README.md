# sonato-cli

Command-line client for the [sona.to](https://sona.to) API. Schedule posts, manage channels and run SEO audits without leaving your terminal.

No dependencies. Needs Node 20 or newer.

## Install

```
npm install -g sonato-cli
```

## Log in

Create a token under API in your sona.to dashboard, then:

```
sona auth login
```

The token is verified before it is saved, so a typo is caught straight away. It goes in `~/.sona/config.json` with owner-only permissions.

## Use

```
sona whoami
sona accounts

sona post list
sona post list --status scheduled
sona post get <id>

sona post create --account <id> --text "Doors open at nine tomorrow."
sona post create --account <id> --text "Sale ends Friday." --at 2026-08-01T09:00:00+07:00
sona post create --account <id> --text "New stock in." --media https://example.com/photo.jpg

sona post edit <id> --at 2026-08-02T09:00:00+07:00
sona post cancel <id>

sona upload photo.jpg              # returns a url
sona upload a.jpg b.jpg --json     # several at once, machine-readable

sona seo create <domain>           # add a site to audit
sona seo projects                  # your audited sites
sona seo project <id>              # one site's issue summary
sona seo issues <id> --severity high
sona seo pages <id>
sona seo audit <id>                # start an audit
sona seo fix <id> <issue-id>       # generate a fix (uses AI credits)
```

SEO commands need the SEO product on your plan, on top of API access.

Upload returns a url per file. Pass it to `post create --media`:

```
URL=$(sona upload photo.jpg --json | jq -r '.[0].url')
sona post create --account <id> --text "New stock" --media "$URL"
```

Repeat `--account` to publish to several channels at once. Either all of them accept the post or none do, so you never get a partial publish without being told.

Times are ISO 8601 with an offset. A time without one is rejected rather than guessed at.

## Scripting

`--json` prints the raw response, so anything can consume it.

```
sona post list --json | jq '.[] | select(.status == "failed")'
sona accounts --json | jq -r '.[].id'
```

Exit codes:

| Code | Meaning |
| --- | --- |
| 0 | fine |
| 1 | the request failed |
| 2 | the command was wrong |
| 3 | not authenticated, or not allowed |
| 4 | rate limited |

## In CI

Set `SONA_TOKEN` and skip the login step. Nothing is written to disk.

```
SONA_TOKEN=sona_... sona post create --account abc --text "Build passed."
```

## Several accounts

Agencies running more than one sona.to account can keep them apart:

```
sona auth login --profile client-a
sona post list --profile client-a
```

Or set `SONA_PROFILE` once.

## Environment

| Variable | Effect |
| --- | --- |
| `SONA_TOKEN` | Use this token instead of a saved profile |
| `SONA_PROFILE` | Which profile to use |
| `SONA_API_URL` | Point at a different install |
| `NO_COLOR` | Turn colour off |

## Docs

Full API reference at [developers.sona.to](https://developers.sona.to). The OpenAPI description is at [developers.sona.to/openapi.yaml](https://developers.sona.to/openapi.yaml).

## Licence

MIT
