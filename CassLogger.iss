; Inno Setup script for Cass Logger (Windows)
; Build: iscc /DAppVersion=v0.1.0 /O"gui\dist" CassLogger.iss

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

[Setup]
AppName=Cass Logger
AppVersion={#AppVersion}
AppPublisher=Cass Logger
DefaultDirName={autopf}\CassLogger
DefaultGroupName=Cass Logger
OutputBaseFilename=CassLogger-{#AppVersion}-win32-x64
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "gui\dist\CassLogger\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Cass Logger"; Filename: "{app}\CassLogger.exe"
Name: "{group}\{cm:UninstallProgram,Cass Logger}"; Filename: "{uninstallexe}"
Name: "{commondesktop}\Cass Logger"; Filename: "{app}\CassLogger.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\CassLogger.exe"; Description: "{cm:LaunchProgram,Cass Logger}"; Flags: nowait postinstall skipifsilent
