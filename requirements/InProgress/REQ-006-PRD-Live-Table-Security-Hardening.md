# REQ-006-PRD — Live Table Security Hardening

| Field | Value |
| ----- | ----- |
| ID | REQ-006-PRD |
| Title | Live Table Security Hardening |
| Status | Todo |
| Author | Blaxine |
| Created | 2026-09-13 |
| Last Updated | 2026-09-13 |

## Problem Statement

Hearthbound now runs live tables for real hosts and players in cloud mode, with real host accounts (email/password) and real game data changing hands every session. Nobody has reported a break-in or a leak, but the host has no current, comprehensive answer to "how secure is this right now?" — only a scattered history of individually-found-and-fixed issues. Without a deliberate pass, gaps in how host accounts are protected, how strictly one table's information is kept from another (or from players who shouldn't see it, like DM notes), and how well the game holds up against abuse or overload can sit undiscovered indefinitely, on a system real people already depend on.

## Solution

A dedicated security hardening pass over the live product: first a review that surfaces where the app currently falls short of protecting host credentials, keeping table and DM-only information private, and staying available under abuse — producing one clear, severity-ranked list of findings. Then, working through that list from most to least severe, each fix is made and shown to the host before it takes effect on the live app, since real sessions are running on it already and nothing should risk disrupting them without the host having seen it first.

## User Stories

1. As a host, I want confidence that my account credentials can't easily be stolen or guessed, so that my account and every table I run stay under my control.
2. As a host or player, I want assurance that another table's information — and, within my own table, information meant for the host only (like DM notes) — genuinely cannot be seen or changed by someone who shouldn't have access, so that private game information stays private.
3. As a host, I want the game to keep working reliably even if someone tries to abuse or overload it, so that my sessions aren't disrupted by something outside normal play.
4. As a host, I want a clear, prioritized list of whatever security gaps are found, so I understand what's wrong and how serious each one is before anything changes.
5. As a host, I want to review and approve each fix before it reaches the live app, so a security improvement doesn't end up breaking an active game session.

## Out of Scope

- Moving players off anonymous sign-in onto real accounts — already a deliberate, standing design decision for this product, not open for reconsideration in this pass.
- Securing local (offline, single-browser) demo mode — that mode has no server or shared trust boundary to harden.
- General reliability or gameplay-sync improvements that aren't security issues, even where they're mentioned alongside security concerns elsewhere.
- Introducing new account-security features not needed to close a found gap (e.g. multi-factor authentication) — this is a hardening pass on what exists, not a redesign of host authentication.
