# 수강생 설치·실습 가이드

범위: macOS/Linux, 본인 소유 메일 계정, 본인 Discord 서버. Windows는 OpenClaw 자체 설치가 가능하지만 이 저장소의 Bash 실행기는 WSL2에서 사용합니다. 명령은 2026-10-24에 OpenClaw 2026.10.6과 Himalaya CLI에서 확인했습니다. 서비스 화면·CLI 옵션이 달라졌다면 각 도구의 최신 공식 문서를 확인하세요.

## 0. 준비물과 권한

- Node.js 20.11 이상, AI 모델을 사용할 수 있는 OpenClaw 설치/로그인.
- 본인 이메일의 IMAP 읽기·SMTP 발송 권한. 제공자가 앱 비밀번호 또는 OAuth를 요구할 수 있습니다.
- Discord 서버 관리 권한. 메일 요약이 보이는 채널은 **본인과 봇만 접근**하도록 만드세요. 메일 원문이나 토큰은 실습 공용 서버에 넣지 마세요.
- 이 스타터는 외부 유료 서비스가 필수는 아니지만, 선택한 AI 모델·메일 제공자의 과금은 본인 설정에 따릅니다.

## 1. OpenClaw 설치와 Gateway

공식 설치 경로: [OpenClaw Getting Started](https://docs.openclaw.ai/start/getting-started).

```bash
curl -fsSL https://openclaw.ai/install.sh | bash
# 안내되는 온보딩을 마치고, foreground Gateway를 종료한 뒤:
openclaw gateway install
openclaw gateway status
openclaw --version
```

설치 스크립트를 실행하기 전에 공식 사이트 주소인지 확인하세요. 기존 OpenClaw가 있다면 재설치하지 말고 버전·Gateway 상태만 확인합니다.

이후 실습 키트를 먼저 내려받고, 아래 명령은 그 폴더에서 실행합니다.

```bash
git clone https://github.com/IrumHahn/openclaw-discord-smart-mailbox.git ~/.openclaw/skills/discord-smart-mailbox
cd ~/.openclaw/skills/discord-smart-mailbox
```

## 2. 메일 분석 전용 에이전트 격리

메일 본문에는 공격자가 적은 지시가 들어갈 수 있습니다. **기본 `main` 에이전트에 메일을 전달하지 않습니다.** 별도 작업 공간을 가진 `mail-triage`를 만들고 모든 도구를 차단합니다.

```bash
openclaw agents list
openclaw agents add mail-triage --workspace "$HOME/.openclaw/workspaces/mail-triage" --non-interactive
openclaw config patch --file docs/triage-agent.patch.json5 --dry-run
openclaw config patch --file docs/triage-agent.patch.json5
openclaw config get agents.entries.mail-triage.tools.deny --json
```

마지막 출력이 `["*"]`인지 확인합니다. 이미 같은 이름의 에이전트가 있다면 새로 만들지 말고 도구 정책과 작업 공간을 먼저 확인하세요. 이 에이전트에는 Discord 채널 바인딩, 메일 비밀번호, 개인 메모리 파일을 주지 않습니다. `~/.openclaw/.env`에 `SMART_MAILBOX_TRIAGE_AGENT=mail-triage`를 추가하세요. 실행기는 시작할 때 `tools.deny`에 `*`가 실제 설정되어 있는지 검사하며, 없으면 메일을 읽지 않습니다. 설정 변경 뒤 Gateway를 재시작합니다.

## 3. Discord 봇과 비공개 채널

공식 상세: [OpenClaw Discord Setup](https://docs.openclaw.ai/channels/discord/setup).

1. [Discord Developer Portal](https://discord.com/developers/applications) → **New Application** → **Bot**. 토큰을 발급받습니다. 채팅이나 GitHub에 붙여 넣지 않습니다.
2. Bot의 **Message Content Intent**를 켭니다. 서버 멤버 인텐트는 OpenClaw 역할 allowlist를 쓸 경우 권장됩니다.
3. OAuth2 URL Generator에서 `bot`, `applications.commands`를 선택하고 서버에 초대합니다. 최소한 **View Channels**, **Send Messages**, **Read Message History**, **Add Reactions**, **Create Public Threads**, **Send Messages in Threads**, **Manage Threads**(완료 스레드 잠금/보관용)를 부여합니다. Discord 서버·채널의 실제 권한 오버라이드도 확인하세요. 이미 다른 권한으로 초대한 봇이라면 다시 초대하지 말고 `#메일함` 채널 설정 → 권한 → 고급 권한 → 봇에서 **공개 스레드 만들기**, **스레드 관리하기**만 허용해도 됩니다.
4. 서버에 비공개 텍스트 채널을 만듭니다. `@everyone`은 View Channel을 끄고 본인과 봇에게만 허용합니다. 실습을 공용 수업 서버에서 한다면 특히 개인별 비공개 채널을 사용합니다.
5. Discord **Developer Mode**를 켜고 채널 우클릭 **Copy Channel ID**, 본인 프로필 우클릭 **Copy User ID**를 기록합니다. 서버 ID는 OpenClaw 페어링에 사용합니다.
6. `~/.openclaw/.env`에 토큰을 저장합니다. 파일을 만들 때 에디터를 써서 셸 히스토리에 값이 남지 않도록 하고 `chmod 600 ~/.openclaw/.env`로 보호합니다. 한 줄 형식은 `DISCORD_BOT_TOKEN='본인_봇_토큰'`입니다.
7. OpenClaw Discord 설정은 공식 문서의 `channels.discord.token` **env SecretRef** 방식으로 패치합니다. 즉 `source: "env"`, `provider: "default"`, `id: "DISCORD_BOT_TOKEN"`이며 `openclaw config patch --file <패치파일> --dry-run` 후 적용합니다. 기존 설정을 덮어쓰지 말고 병합하세요. Gateway를 재시작하고 `openclaw channels status --channel discord --probe`로 확인합니다. 기존에 Discord가 잘 작동한다면 토큰을 다시 만들거나 설정을 갈아엎지 않습니다.

> 이 키트의 실행기는 같은 환경변수 `DISCORD_BOT_TOKEN`을 읽어 Discord REST API를 직접 사용합니다. OpenClaw Discord 채널의 SecretRef와 토큰 원본 파일을 함께 공유하되, 토큰 문자열을 코드나 config.json에 저장하지 않습니다.

## 4. Himalaya에서 메일 계정 연결

공식 프로젝트: [pimalaya/himalaya](https://github.com/pimalaya/himalaya). macOS Homebrew 예시:

```bash
brew install himalaya
himalaya --version
mkdir -p ~/.config/himalaya
read -rsp "앱 비밀번호: " P && echo && printf %s "${P// /}" > ~/.config/himalaya/mail.pass && chmod 600 ~/.config/himalaya/mail.pass
```

이 키트는 **Himalaya v2 이상**이 필요합니다(2026-11-02 v2.2.1에서 확인). 호스팅어 OpenClaw 이미지에는 이미 들어 있습니다. `~/.config/himalaya/config.toml`을 아래처럼 만듭니다. Gmail 예시이며, 네이버는 `imap.naver.com`·`smtp.naver.com`입니다.

```toml
[accounts.personal]
default = true
email = "you@gmail.com"
imap.server = "imap.gmail.com"
imap.sasl.plain.username = "you@gmail.com"
imap.sasl.plain.password.command = "cat ~/.config/himalaya/mail.pass"
smtp.server = "smtp.gmail.com"
smtp.sasl.plain.username = "you@gmail.com"
smtp.sasl.plain.password.command = "cat ~/.config/himalaya/mail.pass"
```

연결을 확인합니다.

```bash
himalaya account list
himalaya mailbox list -a personal
himalaya --json envelope list -a personal -m INBOX -p 1 -s 3
```

`personal`은 **자신이 설정한 계정 ID**로 바꿉니다. 복수 계정이면 각각 설정하세요. 비밀번호·OAuth 비밀값은 Himalaya가 지원하는 키링/비밀 저장 방식을 사용하고, 프로젝트 폴더에 복사하지 않습니다. 각 계정의 **보낸편지함·휴지통·스팸 폴더 이름**은 `himalaya mailbox list` 결과의 ID 그대로 `config.json`에 입력합니다. Gmail의 현지화된 폴더 이름은 `Sent`/`Trash`와 다를 수 있습니다(예: `[Gmail]/보낸편지함`, `[Gmail]/휴지통`, `[Gmail]/스팸함`). 발송 후 보낸편지함 사본은 Gmail이 자동으로 남기므로 `saveSentCopy`는 `false`로 둡니다. 사본을 자동으로 남기지 않는 메일 서버만 `true`로 바꿉니다. 읽기만 확인하는 단계에서는 실제 메일 발송을 하지 않습니다.

## 5. 키트 설치·설정

```bash
cd ~/.openclaw/skills/discord-smart-mailbox
cp config.example.json config.json
chmod 600 config.json ~/.openclaw/.env
```

`config.json`의 채널 ID, 소유자 Discord ID, 계정 ID, 발신 주소, `from`, 보낸편지함/휴지통/스팸 폴더 이름(`sentFolder`, `trashFolder`, `spamFolder`)을 자기 값으로 바꿉니다. `spamFolder`가 없으면 🚫만 동작하지 않고, 나머지는 그대로 동작합니다. `from`은 SMTP 계정이 실제로 발송할 수 있는 주소여야 합니다. 다른 사람을 사칭하는 별칭은 사용하지 않습니다. 파일은 `.gitignore` 대상입니다.

프로젝트의 `scripts/run.sh`는 로컬 `.env`가 있으면 먼저 읽고, 없으면 `~/.openclaw/.env`를 읽습니다. 실습용으로 프로젝트 `.env`를 따로 만들 수 있지만 같은 토큰을 중복 보관하므로 가능한 한 기존 OpenClaw 파일을 활용하세요.

## 6. 기존 메일 보호 → 시험 → 일정 등록

```bash
chmod +x scripts/run.sh
./scripts/run.sh --init
npm test
./scripts/run.sh
```

`--init`은 현재 INBOX를 페이지별로 끝까지 읽어 가장 높은 IMAP UID를 기준선으로 기록하고 **기존 메일을 처리하지 않습니다**. 두 번째 실행부터 이 UID보다 큰 새 메일만 선별합니다. 메일함이 10,000건을 넘거나 Himalaya ID가 숫자 UID가 아니면 안전하게 중지하므로, 별도 실습 계정/폴더를 쓰세요. 실제 시험에는 자신이 관리하는 다른 주소에서 무해한 테스트 문의를 보내세요. Discord에 요약·스레드·초안·반응 6개가 생겼는지 확인합니다. ✅를 누르면 **실제 SMTP 발송**이므로 테스트 수신자가 본인인지 먼저 확인합니다. 발송 후 `himalaya --json envelope list -a personal -m '<보낸편지함>' -p 1 -s 5`와 `.state/mailbox.json`의 `verifiedSentAt`을 확인합니다.

> ⚠️ **첫 메일 시험은 비서(에이전트) 채팅의 exec로 실행하지 마세요.** 다른 에이전트 안에서 `openclaw agent`를 부르면 OpenClaw 세션 보안 정책이 막아서 카드에 "AI 요약 실패"가 뜹니다. `--init`과 `npm test`는 exec로 해도 됩니다. 메일 시험은 아래 정기 작업으로 하거나 VPS 터미널에서 직접 `./scripts/run.sh`를 실행하세요.

상시 실행은 1분마다 `./scripts/run.sh`를 호출합니다. OpenClaw 게이트웨이(호스팅어 VPS 포함)에서는 **OpenClaw 정기 작업을 쓰세요**. AI를 부르지 않는 명령 작업이고, 결과를 채널로 보내지 않습니다.

```bash
openclaw cron list
openclaw cron add --name smart-mailbox --every 1m --command "$HOME/.openclaw/skills/discord-smart-mailbox/scripts/run.sh" --timeout-seconds 280 --no-deliver
```

컴퓨터의 cron/LaunchAgent를 쓸 수도 있습니다. 이미 등록돼 있다면 먼저 목록을 확인하고 중복 등록하지 마세요. cron 예시:

```bash
crontab -l
crontab -e
```

추가할 **한 줄** (절대 경로는 본인 설치 위치로 교체):

```cron
* * * * * /absolute/path/to/discord-smart-mailbox/scripts/run.sh >> /absolute/path/to/discord-smart-mailbox/.state/runner.log 2>&1
```

cron 환경에서 `openclaw`/`himalaya`를 못 찾으면 `PATH`를 crontab에 명시하거나 `scripts/run.sh`에 본인 설치 경로를 설정합니다. macOS에서는 LaunchAgent를 선택해도 됩니다. 기존 스케줄러 설정을 확인하고 병합하며, 같은 키트를 cron과 LaunchAgent 양쪽에 등록하지 않습니다.

## 7. 운영 점검과 장애 대응

- 승인 대기: `.state/mailbox.json`의 `pending`; Discord에서는 카드에 **소유자 한 명의 반응 하나만** 적용됩니다.
- `sending`, `send_uncertain`, `sent_check_failed`: 자동 재발송하지 않습니다. Sent와 실제 수신 여부를 먼저 확인합니다.
- `discord_post_uncertain`/`discord_partial`: 게시물이 이미 생겼는지 채널을 확인합니다. 프로그램은 중복 게시를 피하려고 자동 재시도하지 않습니다.
- `read_failed`: IMAP 설정·권한·메일 ID를 확인합니다. 새 메일 재처리가 필요하면 원장 백업 후 해당 기록만 신중히 복구합니다.
- `trash_uncertain`, `spam_uncertain`: 휴지통·스팸함과 INBOX를 확인하고 수동 결정합니다.
- 글을 남겼는데 "글 내용을 읽지 못했습니다"가 나오면: 봇의 **Message Content Intent**를 켭니다.
- 차단 해제: `./scripts/run.sh --unblock 주소`. 규칙 목록: `./scripts/run.sh --rules`. 규칙 끄기: 자동 답장 알림의 ⏸️ 또는 `./scripts/run.sh --rule-off 규칙ID`. 규칙에는 예시 메일 본문과 승인 문안이 들어 있으며 `.state/mailbox.json`(권한 600)에만 저장됩니다.
- 🔁·🚫는 **내 주소에서 온 메일에는 동작하지 않습니다.** 자신이 관리하는 다른 주소에서 보내 시험합니다. 같은 제목의 답장을 보낸 뒤 5분 안에 온 메일은 이미 답한 것으로 보아 승인 카드로 옵니다.
- 모델 장애: 요약 실패 문구와 빈 초안으로 승인함에 올립니다. 빈 초안에 ✅를 눌러도 발송하지 않습니다.
- 원장과 로그는 개인 정보이므로 백업·보관 정책을 정하고 공유하지 마세요. `.state`는 0700, 상태 파일은 0600으로 생성됩니다.

보안상 Discord 채널을 공개하거나 토큰이 노출됐다면 채널 권한을 잠그고 Discord Developer Portal에서 봇 토큰을 재발급한 뒤 OpenClaw/실행기 환경변수를 갱신하세요.
