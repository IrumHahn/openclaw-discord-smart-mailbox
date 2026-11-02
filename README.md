# OpenClaw × Discord 스마트 메일함

OpenClaw, Himalaya, Discord를 연결해 **메일 선별 → 한국어 핵심 요약·추천 → 비공개 승인 스레드 → 소유자 반응 → 실제 처리 확인**을 재현하는 교육용 오픈소스 키트입니다. 실행학교 AI 에이전트 실전과정의 실습 자료로 만들었습니다.

> 이 저장소는 공개용 범용 스타터입니다. 실제 운영 중인 이룸의 메일함에서 설계 원리를 추출했지만 계정, 토큰, 실제 메일, 개인화된 가격·자동발송 정책은 포함하지 않습니다. 수강생은 자기 계정과 전용 비공개 Discord 채널을 사용합니다.

## 10분 구조 보기

```text
IMAP(Himalaya) ──5분 스캔──> 상태 원장(account:mail-id)
                                │
                                ├─ OpenClaw: 요약·직접 요청 판단·초안
                                ├─ 조치 불필요: 메일 보존, Discord 알림 없음
                                └─ 판단 필요: Discord 비공개 채널 + 메일별 스레드
                                                        │
                                     소유자 한 명의 반응만 1분마다 확인
                                                        │
                          ✅ 발송  🔁 발송+유사메일 자동발송  🗑️ 휴지통
                          🙅 답장 없이 종료  🚫 스팸/차단  ⏸️ 보류  ✍️ 글로 수정
                                                        │
                                   SMTP 전 상태 기록 → Sent 재확인
```

설치는 [docs/setup.md](docs/setup.md), 수업에서 공유할 기능별 해설은 [docs/student-design-guide.md](docs/student-design-guide.md), LLM에 전달할 구현 명세는 [docs/llm-implementation-brief.md](docs/llm-implementation-brief.md)를 보세요. 운영판과 실습판의 구조 비교는 [docs/design.md](docs/design.md), 에이전트가 따라할 설치 스킬은 [SKILL.md](SKILL.md)입니다.

## 빠른 시작

```bash
git clone https://github.com/IrumHahn/openclaw-discord-smart-mailbox.git ~/.openclaw/skills/discord-smart-mailbox
cd ~/.openclaw/skills/discord-smart-mailbox
cp config.example.json config.json
# config.json과 ~/.openclaw/.env를 자기 값으로 작성 — docs/setup.md 참고
chmod 600 config.json ~/.openclaw/.env
./scripts/run.sh --init
./scripts/run.sh
```

Node.js 20.11+, OpenClaw, **도구를 모두 차단한 전용 `mail-triage` 에이전트**, Himalaya, 본인 소유 메일의 IMAP/SMTP 권한, Discord 앱/봇이 필요합니다. `npm test`는 네트워크와 실제 메일 없이 실행됩니다. 전체 설정 없이 위 빠른 시작 명령을 바로 실행하면 안전하게 중지됩니다. 먼저 [설치 가이드](docs/setup.md)의 2–5단계를 마치세요.

**기본값은 보수적입니다.** 설치만으로 켜지는 자동 발송·자동 삭제는 없습니다. ✅는 본인이 누른 최신 카드에서만 유효하고, 자동 답장은 본인이 🔁를 누른 메일과 같은 요청에만, 승인한 문안 그대로, 규칙당 하루 3통까지만 나갑니다. 모델 오류와 불확실한 SMTP 결과는 재시도하지 않고 사람이 확인하도록 멈춥니다. 교육용 스타터는 광고/뉴스레터를 조용히 보존하며, 답장 불필요한 메일을 자동으로 휴지통에 넣지 않습니다.

MIT License. 이 프로젝트는 OpenClaw/Discord/Himalaya의 공식 제품이 아닙니다.
