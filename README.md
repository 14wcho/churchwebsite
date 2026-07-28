# churchwebsite

개인용 로컬 웹앱. 교회 예배 유튜브 영상에서 찬양 이름으로 검색해 해당 타임스탬프로 바로 가고, 로컬 영상도 관리하고, 악보 사진의 코드를 다른 키로 변환할 수 있음.

Next.js 16 (App Router) + TypeScript + Tailwind. 데이터는 DB 서버 없이 `data/db.json` 파일 하나에 저장 (이 컴퓨터에 C++ 빌드 도구가 없어서 better-sqlite3 같은 네이티브 패키지를 일부러 피함).

## 다른 사람이 clone해서 쓰는 법

1. `git clone` 받고 `npm install`
2. `.env.local` 파일 만들고 본인 `YOUTUBE_API_KEY` 입력 (없으면 아래 발급 방법 참고)
3. `lib/youtube.ts`에서 채널 핸들(`@TVHolyimpact`)을 본인 교회 채널로 변경
4. `npm run dev`

`data/db.json`과 `local-videos/` 안 파일들은 개인 데이터라 git에 안 올라가고, 각자 실행하면 자동으로 빈 상태에서 시작함.

## 실행 방법 (내 컴퓨터에서 계속 쓰기)

```bash
npm install   # 이미 되어 있으면 생략
npm run dev
```

브라우저에서 `http://localhost:3000`.

- `/` — 찬양 검색 (메인 페이지)
- `/admin` — 구간 수동 추가/수정/삭제, 채널 동기화, 로컬 영상 관리
- `/transpose` — 악보 코드 키 변환

## 기능별 상태 (4단계 모두 구현+테스트 완료)

| 단계 | 내용 | 상태 |
|---|---|---|
| 1 | 수동 구간 추가/검색 (fuse.js 퍼지 검색) | 완료, 테스트됨 |
| 2 | 유튜브 채널 자동 동기화 (설명란 타임스탬프 파싱) | 완료, 테스트됨 (@TVHolyimpact 채널 388개 영상 / 1032개 구간 정상 수집 확인) |
| 3 | 로컬 영상 폴더 스캔 + 재생 (`local-videos/`) | 완료, 테스트됨 |
| 4 | 악보 OCR + 코드 transpose (`/transpose`) | 완료, 테스트됨 |

## 알아두면 좋은 것 (다시 손댈 때 참고)

1. **교회 채널(@TVHolyimpact)이 임베드 재생을 막아놨음** (`playableInEmbed: false`). 그래서 검색 결과를 눌러도 인라인 재생이 안 되고 유튜브 새 탭으로 링크만 열림 (로컬 영상만 인라인 재생됨). oEmbed로 제목 가져오기도 이 채널 영상은 401 에러 — `YOUTUBE_API_KEY`가 설정되면 자동으로 Data API로 fallback해서 제목을 가져옴.

2. **`tesseract.js`는 Next.js 16 Turbopack 번들링 아래서 그냥 무한정 멈춰버림** (에러도 안 뜨고 응답도 안 옴). `worker_threads`를 직접 스폰하고 `.wasm`/`.traineddata` 경로를 `node_modules` 기준 상대경로로 찾는데, Turbopack이 번들링하면서 그 경로 해석이 깨지기 때문. `next.config.ts`의 `serverExternalPackages: ["tesseract.js"]`로 이미 고쳐놨음 — OCR 관련 코드 만졌는데 다시 멈추면 여기부터 확인.

3. 이 프로젝트는 `AGENTS.md`에 "이 Next.js 버전은 학습 데이터랑 다를 수 있다"는 경고가 있음. 진짜 문서는 `node_modules/next/dist/docs/`에 들어있음 (예: route handler의 `params`는 `Promise`라서 `await` 필요, Cache Components는 opt-in이고 이 프로젝트에선 안 켜져 있어서 옛날 방식 캐싱 동작함).

4. 사용자 개인 유튜브 채널(일렉 기타 영상)은 지금 비공개라서 이번엔 뺐음. 나중에 공개로 바꾸면 교회 채널이랑 똑같은 방식으로 추가하면 됨.

## 폴더 구조

```
app/
  page.tsx              검색 페이지
  admin/page.tsx         관리자
  transpose/page.tsx     악보 코드 변환
  api/
    segments/            구간 CRUD
    videos/[id]/          영상 제목 수정
    sync/                 유튜브 채널 동기화
    local-videos/         로컬 영상 스캔 + 스트리밍
    ocr/                  악보 이미지 OCR
lib/
  db.ts                  data/db.json 읽기/쓰기
  youtube.ts              유튜브 URL 파싱, Data API 호출, 타임스탬프 파싱
  chord.ts                코드 파싱 + 반음 이동
  localVideos.ts           로컬 영상 폴더 스캔
data/db.json              전체 데이터 (channels, videos, segments)
local-videos/              로컬 영상 파일 넣는 곳
```
