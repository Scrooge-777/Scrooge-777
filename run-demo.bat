@echo off
REM One command to run the whole CertVerify network on Windows.
REM Builds the CorDapp, creates the four nodes, opens one window per node and per portal,
REM waits until each is ready, then issues and shares one sample certificate.
REM Close the node and portal windows to stop.
setlocal enabledelayedexpansion
cd /d "%~dp0"
title CertVerify launcher

REM ---- 1. find Java 17 (Corda 4.12 runs only on Java 17) ----------------------------------
set "JDK17="
for /d %%J in ("%ProgramFiles%\Eclipse Adoptium\jdk-17*") do set "JDK17=%%~fJ"
if not defined JDK17 for /d %%J in ("%ProgramFiles%\Java\jdk-17*") do set "JDK17=%%~fJ"
if not defined JDK17 for /d %%J in ("%ProgramFiles%\Microsoft\jdk-17*") do set "JDK17=%%~fJ"
if not defined JDK17 for /d %%J in ("%ProgramFiles%\Zulu\zulu-17*") do set "JDK17=%%~fJ"
if defined JDK17 set "JAVA_HOME=%JDK17%"
if defined JDK17 set "PATH=%JDK17%\bin;%PATH%"

java -version 2>&1 | findstr /c:"version \"17." >nul
if errorlevel 1 (
  echo.
  echo  Java 17 was not found. Corda 4.12 runs only on Java 17.
  echo  Java 8 and Java 25 cannot run it.
  echo.
  echo  Install "Temurin 17 LTS" ^(JDK, x64, .msi^) from https://adoptium.net/temurin/releases/?version=17
  echo  then run this file again. You do not need to uninstall your other Java versions.
  echo.
  pause
  exit /b 1
)
echo Using Java 17 from: %JAVA_HOME%

REM ---- 2. build, test and create the nodes -------------------------------------------------
echo.
echo ==^> Building the CorDapp, running the tests and creating the nodes
echo     The first run downloads several hundred MB and takes 5-15 minutes.
call gradlew.bat clean build deployNodes :clients:bootJar
if errorlevel 1 (
  echo.
  echo  The build failed. Scroll up to the first line that says FAILED or error,
  echo  and send that text to Claude.
  pause
  exit /b 1
)

REM ---- 3. start the four nodes -------------------------------------------------------------
echo.
echo ==^> Starting the four nodes ^(one window each, leave them open^)
for /d %%D in (build\nodes\*) do (
  if exist "%%D\corda.jar" start "Node %%~nxD" cmd /k "cd /d "%%~fD" && java -jar corda.jar"
)

echo Waiting for the nodes to accept connections ^(up to 5 minutes^)...
for %%P in (10003 10006 10009 10012) do (
  call :waitport %%P 150
  if errorlevel 1 (
    echo  A node did not start on RPC port %%P. Look at the node windows for the error.
    pause
    exit /b 1
  )
)
echo All four nodes are ready.

REM ---- 4. start the three portals -----------------------------------------------------------
set "JAR="
for %%J in (clients\build\libs\*.jar) do (
  echo %%~nxJ | findstr /i plain >nul || set "JAR=%%~fJ"
)
set OPENS=--add-opens java.base/java.time=ALL-UNNAMED --add-opens java.base/java.io=ALL-UNNAMED --add-opens java.base/java.util=ALL-UNNAMED --add-opens java.base/java.net=ALL-UNNAMED --add-opens java.base/java.nio=ALL-UNNAMED --add-opens java.base/java.lang.invoke=ALL-UNNAMED --add-opens java.base/java.security.cert=ALL-UNNAMED --add-opens java.base/java.security=ALL-UNNAMED --add-opens java.base/javax.net.ssl=ALL-UNNAMED --add-opens java.base/java.lang=ALL-UNNAMED --add-opens java.base/java.util.concurrent=ALL-UNNAMED --add-opens java.sql/java.sql=ALL-UNNAMED
set RPC=--config.rpc.host=localhost --config.rpc.username=user1 --config.rpc.password=test

echo.
echo ==^> Starting the web portals
start "University portal 8081" cmd /k java %OPENS% -jar "!JAR!" --server.port=8081 --config.rpc.port=10006 %RPC%
start "Student portal 8082" cmd /k java %OPENS% -jar "!JAR!" --server.port=8082 --config.rpc.port=10009 %RPC%
start "Employer portal 8083" cmd /k java %OPENS% -jar "!JAR!" --server.port=8083 --config.rpc.port=10012 %RPC%

for %%P in (8081 8082 8083) do (
  call :waitport %%P 90
  if errorlevel 1 (
    echo  The portal on port %%P did not start. Look at its window for the error.
    pause
    exit /b 1
  )
)
timeout /t 3 /nobreak >nul

REM ---- 5. sample data -----------------------------------------------------------------------
echo.
echo ==^> Issuing and sharing a sample certificate
set "HASH="
for /f "skip=1 tokens=*" %%H in ('certutil -hashfile demo\sample-certificate.txt SHA256') do if not defined HASH set "HASH=%%H"
set "HASH=!HASH: =!"
curl -s -X POST http://localhost:8081/api/certificates -H "Content-Type: application/json" -d "{\"certificateId\":\"VU-2026-CSE-0142\",\"studentName\":\"Asha Rao\",\"rollNumber\":\"1VU22CS042\",\"program\":\"B.Tech\",\"specialization\":\"Computer Science and Engineering\",\"cgpa\":8.74,\"yearOfPassing\":2026,\"documentHash\":\"!HASH!\",\"student\":\"StudentWallet\"}"
echo.
curl -s -X POST http://localhost:8082/api/certificates/VU-2026-CSE-0142/share -H "Content-Type: application/json" -d "{\"verifier\":\"TechCorp Employer\"}"
echo.

echo.
echo   CertVerify is running.
echo     University portal   http://localhost:8081
echo     Student portal      http://localhost:8082
echo     Employer portal     http://localhost:8083
echo.
echo   In the Employer portal, open Verify, enter VU-2026-CSE-0142, choose Vidya University
echo   and upload demo\sample-certificate.txt
echo   Close the node and portal windows to stop.
start "" http://localhost:8083
pause
exit /b 0

REM ---- helper: wait until localhost:%1 accepts TCP connections, %2 tries 2 seconds apart ----
:waitport
set /a TRIES=0
:waitport_loop
powershell -NoProfile -Command "try { $c = New-Object Net.Sockets.TcpClient('localhost', %1); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 exit /b 0
set /a TRIES+=1
if !TRIES! geq %2 exit /b 1
timeout /t 2 /nobreak >nul
goto waitport_loop
