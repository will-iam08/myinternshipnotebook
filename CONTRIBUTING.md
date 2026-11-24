# Contributing to My Internship Notebook

Thanks for helping improve **My Internship Notebook**! Whether you are fixing an accessibility detail, adding support for a new job board in the clipper, improving test coverage, or extending the Java API edition, your contributions are welcome.

---

## Development Setup

### Prerequisites
- **Node.js 22+** (used only for syntax checks, unit tests, static builds, and Playwright E2E tests - nothing here ships to the browser)
- **Java 21 (JDK 21+)** (required for the local HTTP server edition and Java tests)

### Quick Commands

1. **Clone the repository and install dev tools:**
   ```bash
   git clone https://github.com/will-iam08/myinternshipnotebook.git
   cd myinternshipnotebook
   npm install
   npx playwright install chromium webkit   # once, for E2E tests
   ```

2. **Run all frontend checks and unit tests:**
   ```bash
   npm run check
   npm run test:unit
   ```

3. **Run the full test suite (syntax check, unit tests, and Playwright E2E on desktop + iPhone WebKit):**
   ```bash
   npm test
   ```

4. **Preview the browser-only Website Edition locally:**
   ```bash
   npm run build
   npm run serve   # http://127.0.0.1:4173
   ```

5. **Compile and run the Java Server Edition + Java tests:**
   ```bash
   javac --add-modules jdk.httpserver -d out $(find src/main/java src/test/java -name '*.java')
   java --add-modules jdk.httpserver -ea -cp out com.coopcompass.ApplicationRepositoryTest
   java --add-modules jdk.httpserver -ea -cp out com.coopcompass.ApplicationServerSecurityTest
   java --add-modules jdk.httpserver -cp out com.coopcompass.ApplicationServer   # http://localhost:8080
   ```

6. **Build the Save Jobs Browser Extension (`Chrome`, `Edge`, `Firefox`):**
   ```bash
   npm run build:extension   # outputs _extension/ and _extension.zip
   ```

---

## Engineering Conventions

Before making UI or data changes, read [docs/product-decisions.md](./docs/product-decisions.md). Key rules to keep green in CI:

- **Zero runtime dependencies:** Do not introduce runtime npm packages, frameworks, build bundlers for app code, CDNs, or external fonts.
- **Dual storage compatibility:** Changes to application fields or validation must work across both `browserApi` and `serverApi`, validate cleanly inside [`src/main/resources/public/js/domain.js`](./src/main/resources/public/js/domain.js) (including `sanitizeImportedEntry`), and keep `data/*.tsv` loading backward compatible.
- **Service worker cache bump:** Whenever you edit `index.html`, `styles.css`, `js/*.js`, icons, or precached assets, bump the `CACHE` version in [`src/main/resources/public/sw.js`](./src/main/resources/public/sw.js) so offline installs update cleanly.
- **Accessibility & mobile layout:** Preserve WCAG 2.2 AA contrast in both light and dark themes, 44px touch targets, ARIA semantics, keyboard focus restoration, and phone widths (`320px`, `375px`, `390px`, `430px`).
- **Stage color palette:** `--st-*` stage tokens in `styles.css` are checked as an accessible color-vision-deficiency set; avoid modifying one without re-checking the full set.
- **Plain, direct writing:** Keep UI copy, documentation, and commit messages concise and student-friendly, with no em dashes.
- **Repo hygiene:** Never commit real application data, `data/*.tsv`, or `testing.html`.

---

## Pull Request Checklist

1. Keep PRs focused on one clear fix, feature, or improvement.
2. Run `npm test` and the Java tests (`ApplicationRepositoryTest`, `ApplicationServerSecurityTest`) and verify everything passes.
3. Include screenshots or a short recording for UI/layout changes (especially mobile viewports).
4. Update relevant tests (`tests/unit/`, `tests/e2e/`, or `src/test/java/`) and docs when behavior changes.

---

## Community Guidelines

Be respectful, practical, and welcoming so every student and contributor feels comfortable reporting bugs, proposing workflows, or submitting their first PR.
