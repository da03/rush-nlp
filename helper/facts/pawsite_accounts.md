<!-- Account / API key / rate-limit facts for pawsite_accounts_answerer. -->
# Accounts, API keys, and limits

- Authentication is optional; everything works anonymously, but signing in raises limits and lets you name programs.
- Generate API keys at https://programasweights.com/settings, then set `export PAW_API_KEY=paw_sk_...`.
- Anonymous compile rate limit: 20 per hour, 1 concurrent compile request.
- Authenticated compile rate limit: 60 per hour, 2 concurrent compile requests.
- Hosted API limits apply to compile requests; most inference runs locally through the SDK and is not rate-limited.
- Authenticated users can name programs with slugs.
