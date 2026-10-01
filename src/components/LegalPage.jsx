import React, { useEffect, useRef } from 'react';
import { LEGAL as L, LEGAL_DOCS } from '../data/legal.js';

// The legal pages: privacy policy, cookies and storage, terms of use, and
// licenses and credits. Reached from the landing screen's footer at
// #/legal/<doc> (App.jsx). Everything stated here describes what the code
// actually does, so a change to what the app stores, sends or loads from
// someone else's servers needs a matching change here:
//   - browser storage keys          -> the table in CookiesDoc
//   - a new outside service or font -> "Who we share data with" + CookiesDoc
//   - bundled sounds, fonts, rules  -> CreditsDoc
// The operator's own details (name, contact, governing law) live in
// data/legal.js.

const SRD_URL = 'https://dnd.wizards.com/resources/systems-reference-document';
const CC_BY_URL = 'https://creativecommons.org/licenses/by/4.0/legalcode';

function Ext({ href, children }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

function Mail() {
  return L.contactEmail.includes('@') ? <a href={`mailto:${L.contactEmail}`}>{L.contactEmail}</a> : <strong>{L.contactEmail}</strong>;
}

function PrivacyDoc() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="legal-meta">Last updated {L.effectiveDate}</p>

      <p>
        This policy explains what {L.appName} knows about you, why, where it is kept, and what you can do about it.{' '}
        {L.appName} is a virtual tabletop: a Dungeon Master (the &ldquo;DM&rdquo; or &ldquo;host&rdquo;) opens a table,
        shares an invitation code, and players join it to play together on a shared map.
      </p>

      <h2>1. Who is responsible</h2>
      <p>
        {L.appName} is run by {L.operator} (&ldquo;we&rdquo;, &ldquo;us&rdquo;). For anything in this policy, including
        requests about your data, write to <Mail />.
      </p>
      <p>Postal address: {L.operatorAddress}</p>

      <h2>2. The short version</h2>
      <ul>
        <li>We do not sell your personal data. We never have, and we do not share it for advertising.</li>
        <li>There are no ads, no analytics, no tracking pixels and no advertising cookies in {L.appName}.</li>
        <li>You can play without an account. To join a table you give a display name and pick a colour, nothing else.</li>
        <li>
          A guest table is never saved in our database. It lives in the DM&rsquo;s browser, and is only passed along
          live to the people at that table.
        </li>
        <li>We collect only what the game needs to work, and we use it only to run the game and keep it secure.</li>
      </ul>

      <h2>3. What we collect, and when</h2>

      <h3>When you open the site</h3>
      <p>
        Like every website, the servers that deliver {L.appName} receive your IP address, your browser and device type,
        and the time of the request. Our hosting provider keeps this in short-lived server logs to deliver the site and
        to stop abuse. We do not combine it with anything else to identify you.
      </p>
      <p>
        The site&rsquo;s typefaces are loaded from Google Fonts, so your browser also sends your IP address and browser
        type to Google when the page loads. Google states that it does not use this to build profiles or target
        advertising.
      </p>

      <h3>When you join or host a guest table (no account)</h3>
      <ul>
        <li>
          <strong>What you type:</strong> a display name and a colour. Please use a nickname rather than your full
          name.
        </li>
        <li>
          <strong>What happens to the table:</strong> the map, tokens, character sheets, dice rolls and pictures are
          sent live between the browsers at the table through our realtime provider. They are relayed, not stored: we
          keep no copy in a database. The DM&rsquo;s browser holds the table, and each player&rsquo;s browser keeps a
          working copy so the game survives a page refresh.
        </li>
        <li>
          <strong>Connection data:</strong> the realtime provider sees your IP address while you are connected, as any
          server you connect to does.
        </li>
      </ul>

      <h3>When you join or host a cloud table</h3>
      <p>A cloud table is saved on our servers so it is still there next time. For these tables we store:</p>
      <ul>
        <li>
          <strong>An anonymous sign-in.</strong> If you have no account, we create a random user ID for your browser
          so the table can tell you apart from everyone else. It has no email, name or password attached.
        </li>
        <li>
          <strong>Your seat:</strong> your display name, your colour, whether you are the host, and which map you are
          on.
        </li>
        <li>
          <strong>The table itself:</strong> its name, maps, tokens, character sheets (hit points, equipment, coins,
          spells and so on), the DM&rsquo;s private notes, drawings, the in-game clock, and its invitation codes.
        </li>
        <li>
          <strong>Files a host uploads:</strong> music or sound files added to a table.
        </li>
        <li>
          <strong>Preferences:</strong> for example the colour palette you picked.
        </li>
      </ul>

      <h3>When you create a host account</h3>
      <p>
        When account sign-up is offered, we store your email address and your password. The password is stored only as
        a one-way hash by our authentication provider; we cannot read it. We also keep the times your account was
        created and last used. We use your email address only to sign you in. We do not send marketing email.
      </p>

      <h3>What stays on your own device</h3>
      <p>
        Some things are saved in your browser and never sent to us: your saved guest tables, sound volumes, dismissed
        tips, panel sizes, and a cache of pictures used at your tables. The full list is in{' '}
        <a href="#/legal/cookies">Cookies &amp; Storage</a>.
      </p>

      <h3>What we do not collect</h3>
      <ul>
        <li>No real name, postal address, phone number or date of birth.</li>
        <li>No payment details. {L.appName} takes no payments.</li>
        <li>No location, contacts, camera or microphone access.</li>
        <li>No advertising identifiers, and no record of what you do on other sites.</li>
        <li>No analytics about how you use the app.</li>
      </ul>

      <h2>4. Things you write and upload</h2>
      <p>
        Table names, character names, notes, pictures and audio are whatever you choose to put in. Please do not put
        sensitive personal information in them (health details, identity numbers, anything about a real person that
        they would not want shared). Everyone at your table can see most of what is on it.
      </p>

      <h2>5. Who can see what at a table</h2>
      <ul>
        <li>
          <strong>Everyone at the table</strong> sees the display names and colours of the others, the map, the tokens
          the DM has revealed, and the dice rolls players make.
        </li>
        <li>
          <strong>The DM</strong> sees everything on their table, including every character sheet, their own hidden
          rolls, and a log of the changes each player makes to their own character during the session. That log stays
          in the DM&rsquo;s browser and is not stored by us.
        </li>
        <li>
          <strong>DM-only material</strong> (private notes, monster sheets, hidden traps) is not sent to players.
        </li>
        <li>
          <strong>Anyone with the invitation code</strong> can join a table that is open. The DM can remove a player,
          and can replace the code so the old one stops working.
        </li>
        <li>
          <strong>Pictures a DM adds</strong> are passed from browser to browser at the table and kept in each
          member&rsquo;s browser cache. <strong>Audio a host uploads to a cloud table</strong> is stored at a web
          address that anyone who has the exact link could open, so do not upload anything private.
        </li>
      </ul>

      <h2>6. How we use your data</h2>
      <ul>
        <li>To run the game: seat you at a table, keep everyone&rsquo;s screen in step, and save cloud tables.</li>
        <li>To sign you in, if you have an account.</li>
        <li>To keep the service secure and prevent abuse (for example limits on how many tables one host can create).</li>
        <li>To meet legal obligations, and to answer you when you write to us.</li>
      </ul>
      <p>
        We do not use your data for advertising, we do not build profiles of you, and we make no automated decisions
        about you.
      </p>

      <h2>7. Our legal grounds (for people in the EEA, UK and similar regions)</h2>
      <ul>
        <li>
          <strong>To provide the service you asked for:</strong> your seat, your table, your account.
        </li>
        <li>
          <strong>Our legitimate interests</strong> in keeping the service working and secure: server logs, abuse
          limits. These are limited and do not override your rights.
        </li>
        <li>
          <strong>Legal obligations</strong>, where a law requires us to keep or disclose something.
        </li>
        <li>
          <strong>Consent</strong>, in the few cases the law requires it. You can withdraw consent at any time.
        </li>
      </ul>

      <h2>8. Who we share data with</h2>
      <p>
        <strong>We do not sell personal data, and we do not share it with anyone for their own marketing or
        advertising.</strong> We use a small number of companies to run the service, and they handle data only on our
        instructions or as their own published policies describe:
      </p>
      <ul>
        <li>
          <strong>Supabase</strong> (<Ext href="https://supabase.com/privacy">privacy policy</Ext>): database,
          sign-in, live sync between browsers, and storage for uploaded audio.
        </li>
        <li>
          <strong>Vercel</strong> (<Ext href="https://vercel.com/legal/privacy-policy">privacy policy</Ext>): hosts
          and delivers the website.
        </li>
        <li>
          <strong>Google Fonts</strong> (<Ext href="https://policies.google.com/privacy">privacy policy</Ext>):
          delivers the typefaces.
        </li>
      </ul>
      <p>We may also disclose information:</p>
      <ul>
        <li>when the law, a court or a competent authority requires it;</li>
        <li>to protect the safety of a person, or the security of the service;</li>
        <li>
          if the service is ever transferred to another operator, in which case this policy continues to apply to your
          data until you are told otherwise.
        </li>
      </ul>

      <h2>9. Where your data is kept</h2>
      <p>
        Our providers may store and process data on servers outside your own country, including in the United States.
        Where the law requires safeguards for such transfers (for example standard contractual clauses), we rely on
        the ones our providers have in place.
      </p>

      <h2>10. How long we keep it</h2>
      <ul>
        <li>
          <strong>Guest tables:</strong> nothing is kept in our database. The copies in your browser stay until you
          clear your browser data.
        </li>
        <li>
          <strong>Cloud tables:</strong> kept until the host deletes the table, or we remove it. Deleting a table
          deletes its maps, tokens, character sheets, seats, invitation codes and uploaded audio.
        </li>
        <li>
          <strong>A player&rsquo;s seat:</strong> removed when the player leaves the table, when the DM removes them,
          or when the table is deleted.
        </li>
        <li>
          <strong>Host accounts and anonymous sign-ins:</strong> kept until you ask us to delete them, or until we
          remove inactive ones.
        </li>
        <li>
          <strong>Server logs:</strong> kept by our providers for a limited period, as their policies describe.
        </li>
      </ul>
      <p>Backups made by our providers may hold deleted data for a short time before they are overwritten.</p>

      <h2>11. Your rights</h2>
      <p>Depending on where you live, you have the right to:</p>
      <ul>
        <li>ask what data we hold about you, and get a copy;</li>
        <li>have it corrected or deleted;</li>
        <li>object to, or ask us to restrict, how we use it;</li>
        <li>receive it in a portable form;</li>
        <li>withdraw consent where we rely on it;</li>
        <li>complain to your local data protection authority.</li>
      </ul>
      <p>
        You can do much of this yourself: a host can delete their tables from &ldquo;Your tables&rdquo;, a player can
        leave a table to remove their seat, and clearing your browser&rsquo;s site data removes everything stored on
        your device. For anything else, including deleting an account, write to <Mail />. We answer within the time
        the law allows, and we never charge for it or treat you differently for asking. Because most players have no
        account, we may need a detail such as your table&rsquo;s invitation code to find your data.
      </p>
      <p>
        <strong>California residents:</strong> we do not sell or share personal information as those terms are defined
        in the CCPA/CPRA, and have not done so in the past 12 months. You have the rights to know, delete and correct
        described above.
      </p>

      <h2>12. Children</h2>
      <p>
        {L.appName} is not directed at children under {L.minAge}, and we do not knowingly collect personal data from
        them. If you are under the age at which your country lets you agree to this on your own, use {L.appName} only
        with a parent or guardian&rsquo;s permission. If you believe a child has given us personal data, write to us
        and we will delete it.
      </p>

      <h2>13. Security</h2>
      <p>
        Connections to {L.appName} are encrypted. Cloud tables are protected by access rules in the database, so only
        people seated at a table can read it and DM-only material is readable by the DM alone. Passwords are stored
        hashed. No system is perfectly secure, so we cannot promise that nothing will ever go wrong; if a breach
        affects your data, we will tell you and the authorities as the law requires.
      </p>
      <p>
        A guest table relies on its invitation code and its private DM code. Keep the DM code to yourself, and share
        the invitation code only with the people you want at your table.
      </p>

      <h2>14. Changes to this policy</h2>
      <p>
        If we change this policy we will update the date at the top. If a change is significant, we will say so on the
        site before it takes effect.
      </p>

      <h2>15. Contact</h2>
      <p>
        {L.operator} &middot; <Mail />
      </p>
    </>
  );
}

const STORAGE_ROWS = [
  ['hearthbound:current', 'Which table this browser tab was at, so a page refresh puts you back in your seat.', 'Until you leave the table'],
  ['hearthbound:session:<code>', 'A saved copy of a guest or local table, so it survives a refresh or a closed tab.', 'Until you clear it'],
  ['hearthbound:guestmeta:<code>', 'Whether a guest table was closed properly, to offer to recover it after a crash.', 'Until you clear it'],
  ['hearthbound:identity:<code>', 'Your seat (name and colour) at a local demo table.', 'Until you clear it'],
  ['sb-…-auth-token', 'Your sign-in: an anonymous ID, or your host account. Set by our sign-in provider (Supabase).', 'Until you sign out'],
  ['hearthbound_theme', 'The colour palette you picked.', 'Until you clear it'],
  ['hearthbound:audiovol:<table>, tb.diceVolume, tb.sfxVolume.*, tb.muteDevice', 'Your own volume levels and the "mute on this device" switch.', 'Until you clear it'],
  ['hearthbound:hints', 'Which tips you have already dismissed.', 'Until you clear it'],
  ['hearthbound:panelwidths, hearthbound:hud:*', 'The sizes of the side panels and which on-screen panels you folded away.', 'Until you clear it'],
  ['hearthbound:drawprefs', 'Your last drawing tool settings (colour, line width).', 'Until you clear it'],
  ['hearthbound:revealRolls', 'The DM’s choice to show their dice rolls to players.', 'Until you clear it'],
  ['hearthbound.monsterImages', 'Pictures a DM chose for the built-in monsters.', 'Until you clear it'],
  ['IndexedDB: tales-beyond-images', 'A cache of pictures used at your tables, so they do not have to be sent again.', 'Until you clear it'],
];

function CookiesDoc() {
  return (
    <>
      <h1>Cookies &amp; Storage</h1>
      <p className="legal-meta">Last updated {L.effectiveDate}</p>

      <h2>1. The short version</h2>
      <ul>
        <li>{L.appName} sets no cookies of its own.</li>
        <li>There are no advertising, analytics or tracking cookies, from us or anyone else.</li>
        <li>
          The app does save a few things in your browser&rsquo;s storage so the game works: your seat, your saved
          tables, your sign-in and your settings. None of it is used to track you.
        </li>
      </ul>

      <h2>2. Why there is no cookie banner</h2>
      <p>
        Consent banners are required for storage that is not needed to provide what you asked for, such as advertising
        or analytics. Everything {L.appName} stores is either strictly necessary to run the game you opened, or
        remembers a setting you chose yourself. We use nothing that needs your consent, so we do not interrupt you to
        ask for it. If that ever changes, we will ask first.
      </p>

      <h2>3. What is stored in your browser</h2>
      <p>
        This is kept in your browser&rsquo;s local storage and IndexedDB (browser storage that works like cookies but
        is not sent to servers with every request). It stays on your device.
      </p>
      <div className="legal-table-wrap">
        <table className="legal-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">What it is for</th>
              <th scope="col">Kept</th>
            </tr>
          </thead>
          <tbody>
            {STORAGE_ROWS.map(([name, purpose, kept]) => (
              <tr key={name}>
                <th scope="row">
                  <code>{name}</code>
                </th>
                <td>{purpose}</td>
                <td>{kept}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>4. Other companies&rsquo; services on this site</h2>
      <ul>
        <li>
          <strong>Supabase</strong> runs sign-in, the database and live sync. It stores the sign-in entry listed above
          in your browser. It sets no advertising cookies.
        </li>
        <li>
          <strong>Google Fonts</strong> delivers the typefaces. It sets no cookies, but your browser sends your IP
          address to Google to fetch them.
        </li>
        <li>
          <strong>Vercel</strong> hosts the site and, like any host, sees your IP address when your browser requests a
          page.
        </li>
      </ul>

      <h2>5. Clearing it</h2>
      <p>
        You can remove everything above at any time from your browser&rsquo;s settings (&ldquo;Clear site data&rdquo;
        or &ldquo;Clear browsing data&rdquo;). Be aware that this also deletes any guest table saved in this browser:
        export it first if you want to keep it. Blocking storage altogether stops the game from working.
      </p>

      <h2>6. Contact</h2>
      <p>
        Questions about this page: <Mail />. More about how we handle data is in the{' '}
        <a href="#/legal/privacy">Privacy Policy</a>.
      </p>
    </>
  );
}

function TermsDoc() {
  return (
    <>
      <h1>Terms of Use</h1>
      <p className="legal-meta">Last updated {L.effectiveDate}</p>

      <p>
        These terms are the agreement between you and {L.operator} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) for using{' '}
        {L.appName}. By hosting or joining a table, or creating an account, you agree to them. If you do not agree,
        please do not use {L.appName}.
      </p>

      <h2>1. What {L.appName} is</h2>
      <p>
        {L.appName} is a virtual tabletop for playing tabletop role-playing games with other people over the internet:
        shared maps, tokens, character sheets, dice and music. It is a tool for running your own games. It is not a
        gambling service: nothing in it can be won, bought or exchanged for money.
      </p>

      <h2>2. Who can use it</h2>
      <p>
        You must be at least {L.minAge} years old. If you are under the age of majority where you live, you need a
        parent or guardian&rsquo;s permission, and they agree to these terms for you.
      </p>

      <h2>3. Tables, codes and accounts</h2>
      <ul>
        <li>
          <strong>Guest tables are yours to keep safe.</strong> A guest table is saved only in the DM&rsquo;s browser.
          We hold no copy and cannot recover it. Export it if you want to keep it.
        </li>
        <li>
          <strong>Codes are keys.</strong> Anyone with a table&rsquo;s invitation code can join it while it is open,
          and anyone with a guest table&rsquo;s DM code and its exported file can run it. You are responsible for who
          you give them to.
        </li>
        <li>
          <strong>Accounts.</strong> If you have a host account, keep your password to yourself and tell us if you
          think someone else has used it. You are responsible for what happens under your account.
        </li>
        <li>
          <strong>The DM runs the table.</strong> The DM decides who sits at their table, can remove a player, can
          change the invitation code, and can see and edit everything on the table, including your character. We do
          not referee disputes between a DM and their players.
        </li>
      </ul>

      <h2>4. Your content</h2>
      <p>
        You keep ownership of what you create and upload: maps, pictures, audio, names, notes and characters
        (&ldquo;your content&rdquo;). You give us permission to store it, copy it and pass it to the other people at
        your table, only as far as needed to run {L.appName} for you. That permission ends when the content is
        deleted.
      </p>
      <p>By adding content you confirm that:</p>
      <ul>
        <li>you made it yourself, or you have the right to use it (for example under a licence that allows it);</li>
        <li>it does not infringe anyone&rsquo;s copyright, trademark, privacy or other rights;</li>
        <li>it is lawful where you are and where the people at your table are.</li>
      </ul>
      <p>
        We do not review what is on your tables, and we are not responsible for content that users add. We may remove
        content, or close a table, that breaks these terms or the law.
      </p>

      <h2>5. Rules of conduct</h2>
      <p>You agree not to:</p>
      <ul>
        <li>harass, threaten, or abuse other people, or share content that sexualises minors;</li>
        <li>upload anything illegal, or anything you have no right to share;</li>
        <li>put other people&rsquo;s personal information on a table without their permission;</li>
        <li>try to get into tables, accounts or data that are not yours, or guess invitation codes;</li>
        <li>overload, disrupt, probe or reverse-engineer the service, or use bots or scripts to create tables or seats in bulk;</li>
        <li>use {L.appName} to send spam or malware;</li>
        <li>pretend to be someone else, or misrepresent your connection to a person or company.</li>
      </ul>

      <h2>6. Copyright complaints</h2>
      <p>
        If you believe something on {L.appName} infringes your copyright, write to <Mail /> with: what the work is,
        where the material is (the table&rsquo;s name or invitation code helps), your contact details, a statement
        that you believe in good faith the use is not authorised, and a statement that your notice is accurate and
        that you are the owner or act for them. We will remove material where a valid complaint is made, and we may
        close the tables of people who infringe repeatedly.
      </p>

      <h2>7. The app, and other people&rsquo;s rights</h2>
      <p>
        The {L.appName} software, its design, its name and its original text and artwork belong to us or to those who
        licensed them to us. You may use the app to play; you may not copy, resell or redistribute it except as the
        law or an open-source licence allows.
      </p>
      <p>
        {L.appName} is an independent product. It is not affiliated with, endorsed by or sponsored by Wizards of the
        Coast or any other game publisher. Game rules material and third-party work included in the app are listed,
        with their licences, in <a href="#/legal/credits">Licenses &amp; Credits</a>.
      </p>

      <h2>8. Availability</h2>
      <p>
        {L.appName} is provided free of charge. We try to keep it running, but we do not promise that it will always
        be available, free of errors, or that any table or file will be kept. We may change, limit or stop any part of
        it, and we may limit use to protect the service (for example the number of tables one host can keep). Save or
        export anything you cannot afford to lose.
      </p>

      <h2>9. Ending your use</h2>
      <p>
        You can stop using {L.appName} at any time, delete your tables, and ask us to delete your account. We may
        suspend or end your access if you break these terms, if the law requires it, or if we stop offering the
        service. Sections that by their nature should continue (content you were responsible for, disclaimers, limits
        of liability) continue after that.
      </p>

      <h2>10. No warranty</h2>
      <p>
        To the fullest extent the law allows, {L.appName} is provided &ldquo;as is&rdquo; and &ldquo;as
        available&rdquo;, without warranties of any kind, whether express or implied, including fitness for a
        particular purpose, uninterrupted availability, or that it is free of errors.
      </p>

      <h2>11. Limit of liability</h2>
      <p>
        To the fullest extent the law allows, we are not liable for indirect, incidental or consequential loss, or for
        loss of data, tables, content or enjoyment, arising from your use of {L.appName} or from what other users do
        there. Because the service is free, our total liability to you for any claim is limited to the greater of the
        amount you paid us in the 12 months before the claim (if any) and the minimum amount the law requires.
      </p>
      <p>
        Nothing in these terms removes rights you have under consumer law that cannot be waived, or limits liability
        that the law does not allow to be limited, such as for fraud or for death or injury caused by negligence.
      </p>

      <h2>12. If you cause us a loss</h2>
      <p>
        If someone brings a claim against us because of content you added or because you broke these terms, you agree
        to cover the reasonable costs that result, as far as the law in your country allows.
      </p>

      <h2>13. Governing law</h2>
      <p>
        These terms are governed by the law of {L.governingLaw}, and its courts have jurisdiction. If you are a
        consumer, you also keep the protection of the mandatory laws of the country you live in, and you may bring
        proceedings there.
      </p>

      <h2>14. Changes to these terms</h2>
      <p>
        We may update these terms. We will change the date at the top and, for significant changes, say so on the site
        before they take effect. Using {L.appName} after a change means you accept the new terms.
      </p>

      <h2>15. General</h2>
      <p>
        If a part of these terms turns out to be unenforceable, the rest still applies. If we do not enforce a term
        once, we can still enforce it later. These terms, with the <a href="#/legal/privacy">Privacy Policy</a>, are
        the whole agreement between us about {L.appName}.
      </p>

      <h2>16. Contact</h2>
      <p>
        {L.operator} &middot; <Mail />
      </p>
    </>
  );
}

function CreditsDoc() {
  return (
    <>
      <h1>Licenses &amp; Credits</h1>
      <p className="legal-meta">Last updated {L.effectiveDate}</p>

      <h2>1. Not an official product</h2>
      <p>
        {L.appName} is an independent, unofficial tool. It is not affiliated with, endorsed, sponsored or approved by
        Wizards of the Coast LLC, Hasbro, Inc., or any other game publisher.
      </p>
      <p>
        Dungeons &amp; Dragons, D&amp;D, and their logos are trademarks of Wizards of the Coast LLC in the United
        States and other countries. They are mentioned here only to say which games {L.appName} can be used to play.
        All other trademarks belong to their owners.
      </p>

      <h2>2. Game rules material (SRD 5.1)</h2>
      <p>
        This work includes material taken from the System Reference Document 5.1 (&ldquo;SRD 5.1&rdquo;) by Wizards of
        the Coast LLC and available at <Ext href={SRD_URL}>{SRD_URL}</Ext>. The SRD 5.1 is licensed under the Creative
        Commons Attribution 4.0 International License available at <Ext href={CC_BY_URL}>{CC_BY_URL}</Ext>.
      </p>
      <p>
        In {L.appName} that material is the game statistics of the built-in monsters, and the names of conditions,
        abilities, skills and similar rules terms. The descriptions and the way they are presented are our own. We
        have changed the SRD material by selecting from it, shortening it and reformatting it.
      </p>

      <h2>3. Sound</h2>
      <p>
        The built-in sound effects and the encounter music come from <Ext href="https://pixabay.com/">Pixabay</Ext>{' '}
        and are used under the <Ext href="https://pixabay.com/service/license-summary/">Pixabay Content License</Ext>.
        The dice roll and page-turn sounds are by freesound_community on Pixabay. Where a built-in song has a credit,
        it is shown beside the song in the Music window.
      </p>

      <h2>4. Typefaces</h2>
      <p>
        Spectral, Spectral SC, Instrument Sans, IBM Plex Mono, Cinzel, Chakra Petch and IM Fell English are used under
        the <Ext href="https://openfontlicense.org/">SIL Open Font License 1.1</Ext> and delivered by Google Fonts.
      </p>

      <h2>5. Software</h2>
      <p>
        {L.appName} is built with open-source software, including React, Vite and the Supabase client library, each
        used under the MIT License. Their copyright notices and licence texts are kept with the software.
      </p>

      <h2>6. Content added by users</h2>
      <p>
        Maps, pictures, music and text that a DM or player adds to a table belong to whoever added them, or to their
        original owners. They are not ours, and we do not check them. If you believe something infringes your rights,
        see &ldquo;Copyright complaints&rdquo; in the <a href="#/legal/terms">Terms of Use</a> or write to <Mail />.
      </p>

      <h2>7. A game of imagination</h2>
      <p>
        Everything in a game played on {L.appName} is fiction. Any resemblance between a table&rsquo;s characters or
        events and real people or events is the work of the people at that table, not ours.
      </p>
    </>
  );
}

const DOC_COMPONENTS = { privacy: PrivacyDoc, cookies: CookiesDoc, terms: TermsDoc, credits: CreditsDoc };

export default function LegalPage({ doc, onClose }) {
  const Doc = DOC_COMPONENTS[doc] || PrivacyDoc;
  const scrollRef = useRef(null);
  // Each document starts at its top.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [doc]);

  return (
    <div className="legal-page" ref={scrollRef}>
      <div className="legal-shell">
        <nav className="legal-nav" aria-label="Legal documents">
          <button type="button" className="link-btn" onClick={onClose}>
            ← Back
          </button>
          <span className="legal-tabs">
            {LEGAL_DOCS.map((d) => (
              <a key={d.id} href={`#/legal/${d.id}`} aria-current={d.id === doc ? 'page' : undefined}>
                {d.title}
              </a>
            ))}
          </span>
        </nav>
        <article className="legal-doc">
          <Doc />
        </article>
      </div>
    </div>
  );
}

// The row of links under the landing screen.
export function LegalFooter() {
  return (
    <footer className="legal-footer">
      <nav aria-label="Legal">
        {LEGAL_DOCS.map((d) => (
          <a key={d.id} href={`#/legal/${d.id}`}>
            {d.title}
          </a>
        ))}
      </nav>
      <p>
        {L.appName} is an independent tool, not affiliated with or endorsed by Wizards of the Coast. No ads, no
        tracking, and we never sell your data.
      </p>
    </footer>
  );
}
