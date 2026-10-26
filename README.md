# Naphium Chess Rooms

Build a lightweight real-time multiplayer chess web app named Naphium Chess that lets two players play without any login or registration.

App Name & Footer/Support:

App Name: Naphium Chess

Owner Attribution & Support Section: Mention Md. Nafim Muttaki as the creator/owner. Add a "Support & Socials" section in the footer/sidebar with links for:

Facebook:(https://www.facebook.com/naphium)

Instagram: (https://www.instagram.com/nafim.exe)

GitHub:(https://github.com/mdnafimmuttaki)

Site: https://nafim.vercel.app

Core Features:

Zero-Login Room System:

Landing page with a "Create Game" button that generates a unique link/code (e.g., /game/xyz-123).

Creator joins as White; second player joining via link becomes Black; subsequent visitors become Spectators.

Real-Time Gameplay:

WebSockets for instant move synchronization.

Legal move validation (check, checkmate, stalemate, castling, promotion) and turn enforcement using chess.js.

UI & Session Persistence:

Clean board with valid move highlights, captured pieces, turn indicator, and a "Copy Invite Link" button.

Save assigned player roles in localStorage so refreshing the page doesn't break the match.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/6b4fc6d7-f0b1-42b0-8306-6bc18e856ac3).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
