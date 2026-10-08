; Hawary's Bot installer (Inno Setup 6). Built by .github/workflows/windows-app.yml after scripts/package_windows.py stage:
;   iscc /DAppVersion=1.0.7 installer\HawarysBot.iss
; Installs for the current user (no admin), so the bot can update itself. Admin is asked once, only for the firewall rule.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#define Stage "..\dist\stage"

[Setup]
AppId={{9B6E2F4A-3C1D-4E8B-A5F7-2D9C0B1E6A43}
AppName=Hawary's Bot
AppVersion={#AppVersion}
AppPublisher=Hawary Store
AppPublisherURL=https://github.com/Youssef-Hawary/hawarys-bot
DefaultDirName={localappdata}\Programs\HawarysBot
DisableDirPage=auto
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\dist
OutputBaseFilename=HawarysBot-Setup
SetupIconFile={#Stage}\hawary.ico
UninstallDisplayIcon={app}\hawary.ico
UninstallDisplayName=Hawary's Bot
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
CloseApplications=force
RestartApplications=no
ShowLanguageDialog=no
SetupLogging=yes

[Messages]
FinishedLabel=Hawary's Bot is installed.%n%nFrom now on, just double-click the Hawary's Bot icon on your desktop. It starts the bot, opens Eldorado and the dashboard, and updates itself.

[Tasks]
Name: desktopicon; Description: "Put a Hawary's Bot icon on the desktop"
Name: autostart; Description: "Start the bot automatically when Windows starts"; Flags: unchecked
Name: firewall; Description: "Let workers on this network open the dashboard (Windows asks for permission once)"

[InstallDelete]
; The bot's browser: remove the old version before copying the new one.
Type: filesandordirs; Name: "{app}\runtime\chrome"

[Files]
Source: "{#Stage}\runtime\*"; DestDir: "{app}\runtime"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#Stage}\app\{#AppVersion}\*"; DestDir: "{app}\app\{#AppVersion}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#Stage}\app\current.txt"; DestDir: "{app}\app"; Flags: ignoreversion
Source: "{#Stage}\hawary.ico"; DestDir: "{app}"; Flags: ignoreversion
; Your data (database, backups, the bot browser's Eldorado login) lives in {app}\data and is never touched.

[Icons]
Name: "{autodesktop}\Hawary's Bot"; Filename: "{app}\runtime\node\node.exe"; Parameters: """{app}\runtime\launch.cjs"""; WorkingDir: "{app}"; IconFilename: "{app}\hawary.ico"; Comment: "Start Hawary's Bot"; Flags: runminimized; Tasks: desktopicon
Name: "{autoprograms}\Hawary's Bot"; Filename: "{app}\runtime\node\node.exe"; Parameters: """{app}\runtime\launch.cjs"""; WorkingDir: "{app}"; IconFilename: "{app}\hawary.ico"; Comment: "Start Hawary's Bot"; Flags: runminimized
Name: "{userstartup}\Hawary's Bot"; Filename: "{app}\runtime\node\node.exe"; Parameters: """{app}\runtime\launch.cjs"""; WorkingDir: "{app}"; IconFilename: "{app}\hawary.ico"; Flags: runminimized; Tasks: autostart

[Run]
; Firewall: allow only the bot's node.exe, only port 8787, only from the local network. Skipped on silent self-updates (already there).
Filename: "{sys}\cmd.exe"; Parameters: "/c netsh advfirewall firewall delete rule name=""Hawary's Bot"" >nul & netsh advfirewall firewall add rule name=""Hawary's Bot"" dir=in action=allow program=""{app}\runtime\node\node.exe"" protocol=TCP localport=8787 remoteip=localsubnet profile=any"; StatusMsg: "Letting workers on this network open the dashboard..."; Flags: shellexec runhidden waituntilterminated; Verb: runas; Tasks: firewall; Check: not WizardSilent
Filename: "{app}\runtime\node\node.exe"; Parameters: """{app}\runtime\launch.cjs"""; WorkingDir: "{app}"; Description: "Start Hawary's Bot now"; Flags: postinstall nowait skipifsilent runminimized
; After a silent self-update, start the bot again.
Filename: "{app}\runtime\node\node.exe"; Parameters: """{app}\runtime\launch.cjs"""; WorkingDir: "{app}"; Flags: nowait runminimized; Check: WizardSilent

[UninstallRun]
Filename: "{sys}\cmd.exe"; Parameters: "/c netsh advfirewall firewall delete rule name=""Hawary's Bot"""; Flags: shellexec runhidden waituntilterminated; Verb: runas; RunOnceId: "RemoveFirewallRule"

[UninstallDelete]
; App versions the bot downloaded itself, and its copy of the extension. data\ stays unless you delete it yourself.
Type: filesandordirs; Name: "{app}\app"
Type: filesandordirs; Name: "{app}\extension"
