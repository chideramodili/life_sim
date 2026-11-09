UPDATE 67 - Email reset, bus collisions, street police, hospital beds   (apply AFTER update 66)

FILE -> PATH (copy over the same path in your project)
server/index.js, police.js, traffic.js -> server/
client/index.html -> client/
client/src/main.js, street.js, hudUi.js, lifeUi.js -> client/src/

WHAT'S NEW
1. Password reset by email
   - Menu now has "Email for password reset": type your email, press "Send me a code", type the 6-digit code to confirm.
   - On the forgot-password screen there is "Email me a code instead": type your username (or email) first, press it,
     then type the 6-digit code in the code box with a new password. The old recovery code still works too.
   - Codes last 15 minutes, 5 wrong tries lock the code, one request per minute, an email belongs to one account only.
   - To send REAL emails for free: make a free Brevo account (brevo.com), verify your sender email there, create an API key,
     then start the server like this (Windows PowerShell):
         $env:BREVO_API_KEY="xkeysib-your-key"; $env:MAIL_FROM="you@gmail.com"; node index.js
     Without these, the email text (with the code) is printed in the server window, which is fine for testing.
2. Buses and taxis no longer drive through NPC cars: they slow down and stop behind a car, and cars brake for the whole bus.
   If two vehicles block each other for 8 seconds, the blocking car drives off.
3. Street police
   - 2 checkpoints on the first east-west road (patrol car, cones, blue sign). With a car or bike you may be checked (60%):
     speeding = fine of N2,500; big overdue fines = arrested; otherwise waved through.
   - Real police patrol cars are among the traffic. If one sees you faster than about 58 km/h within 16 m, a chase starts (offence: Speeding).
4. Hospital beds: when you are sick, go into the Hospital and press "Rest in bed". You lie down (others see you), recover twice as fast,
   and get energy back. Walk or press "Get up" to stand. Two free beds.

TEST
- Menu > add your email > check the server window for the code.
- Take a bus on the street while traffic is busy.
- Drive past the checkpoint fast, then slowly. Drive fast near a patrol car.
- Get sick (or wait), go to the Hospital, press Rest in bed.

CAVEATS
- Checkpoints only check drivers, not walkers. Walkers with big fines are still caught by the old random patrol.
- Beds: only sick players can use them.
