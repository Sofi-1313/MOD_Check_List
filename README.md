# MOD-Check-List-V1.10

New in V1.10:
- Dashboard summary cards
- Report filtering
- Excel export
- Admin user management

## Demo users
- admin / 1234
- user1 / 1234
- user2 / 1234

## Backend
```bash
cd backend
npm install
npm start
```

## Frontend
```bash
cd frontend
npm install
npm run dev
```


## V1.10.1
- Admin can edit existing checklist templates
- Admin can delete checklist templates that do not have assignment history

## Server Autostart
For a production-style install on Windows:

1. Build and run the app with:
```bat
start_mod_checklist_server_forever.bat
```

2. Install automatic startup as Administrator:
```powershell
powershell -ExecutionPolicy Bypass -File .\install_windows_autostart.ps1
```

After that, Windows will start the MOD server automatically on boot and restart it if the process stops.

Important:
- A program cannot power on a fully shut down computer by itself.
- If you want the computer to wake remotely after shutdown, enable Wake-on-LAN in BIOS/UEFI and the network adapter settings, then send a Wake-on-LAN packet from another device.

## V1.10.5
- Admin panel split into Templates, Assignments, User Management, and Completed Reports menu views.
- AI Action Plan Excel export for failed YES/NO items.
- Azure OpenAI/OpenAI action-plan classification support with local fallback.
- Template display title and optional template image support.
- Checklist image is shown proportionally at smaller size.
- Question types renamed for admin clarity: Yes / No / N/A, Date, Text, Dropdown, Check Box.
- Check Box questions support multiple selected answers.
- Excel import for template questions from a simple Question column or first filled column.

## Run V1.10.5
```bat
run_mod_checklist_v1_10_5.bat
```
"# MOD_Check_List" 
