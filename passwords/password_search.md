# Password Search
what is a good way to show how strong passwords improve the odds. help me design a webpage that can parse passwords and track the progress. for a demonstration im not sure we have to encrypt anything, its just more of a timing effort and pattern matching. what is a good approach?

# Overview
- I'm giving a talk in january about data security and i want a visual way to demonstrate how easily passwords can be searched and compromised.
- i want a visual of several passwords, some being input by users, and a timer and counter until the password is matched.
- some will be simple 4 digit pin numbers, others 6 pins 
- some with be 6 digit alphanumeric combinations
- some 8 digit
- some will be complex passwords with a mix of letters, numbers, and symbols
- the visual should show the time and attempts it takes to crack each type of password
- ideally, it should update in real-time as the search progresses


- it should also highlight the differences in difficulty between simple and complex passwords, showing how much longer it takes to crack stronger passwords
- ideally, it should provide a visual comparison, such as a bar graph or progress bars, to make the differences immediately apparent
- it should also allow for different attack methods, like brute force or dictionary attacks, to show how the approach affects the time to crack passwords
- ideally, it should provide an option to simulate different computing power levels, demonstrating how faster hardware can reduce the time to crack passwords
- it should allow for user interaction, such as inputting their own passwords to see how quickly they can be cracked under different scenarios

# Implementation Ideas
- Use a web-based interface with HTML, CSS, and JavaScript to create the visual representation.
- Implement a timer and attempt counter for each password being tested.
- Use progress bars or a bar graph to visually represent the time and attempts for each password.
- Allow users to input their own passwords and select different attack methods.
- Simulate different computing power levels to show how hardware affects cracking time.
- Highlight the differences in difficulty between simple and complex passwords.

# Webpage
- make it a static webpage without requiring a backend server, using only client-side technologies like HTML, CSS, and JavaScript.

## Implemented demonstration
- Open `/passwords/` on the development or production site. This is a separate public Vue entry point, without the WolfDrive dashboard, router, or API calls.
- Vite development and preview servers redirect `/passwords` to `/passwords/` before the dashboard SPA fallback, preserving query parameters. The site root `/` remains the media dashboard and requires the Hono API; for the password demonstration alone, run `bun run dev:web` and open `/passwords/`.
- Run `bun run build` to build both pages, or `bun run build:passwords` to build only the demonstration while preserving existing dashboard output. Both produce `dist/passwords/index.html` and its local assets. The built `dist` directory can also be hosted by a static web server with no backend.
- Use invented examples only. Inputs are visible, stay in browser memory, and are cleared by **Reset & clear** or a reload; there is no password storage, logging, analytics, or network submission.
- Exhaustive mode really searches PINs of up to six digits in a Web Worker. Larger spaces use a clearly labeled simulation of the known target's fixed-order position. Real searches are capped at 1,000 candidates per 50 ms tick per example; the requested rate is not a hardware benchmark.
- Dictionary modes compare actual candidates from a small bundled list. Exhaustion means only "not found in this dictionary"; it does not prove a password is safe.
- The logarithmic chart models average exhaustive time for uniformly random passwords from the inferred character classes and known length, not human-chosen password strength. Printable ASCII only, up to 64 characters, is supported; unsupported inputs are rejected explicitly.
- The chart also compares an illustrative opaque API token containing 256 cryptographically random bits (32 bytes / 64 hex characters), using `2^256` possibilities rather than inferring strength from its display length. No token is generated or searched. Token formats vary; public prefixes do not add entropy, and theft bypasses guessing resistance.
- The progress bars show search-space or dictionary coverage, not how close an unknown password is to being cracked. No real accounts, files, encryption, or password hashes are attacked.