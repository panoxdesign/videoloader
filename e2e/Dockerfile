# Playwright-Container der Test-Compose. Die Version muss zu @playwright/test in package.json passen.
ARG PLAYWRIGHT_VERSION=1.64.1
FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble
ARG PLAYWRIGHT_VERSION
WORKDIR /e2e
RUN npm init -y >/dev/null && npm install --no-audit --no-fund @playwright/test@${PLAYWRIGHT_VERSION}
COPY playwright.config.ts ./
COPY e2e/*.spec.ts ./e2e/
CMD ["npx", "playwright", "test"]
