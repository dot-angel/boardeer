// ⚠️ 이 파일은 본인의 Firebase 프로젝트 설정으로 교체된 상태입니다.

const firebaseConfig = {
  apiKey: "AIzaSyDm4rHJzhHphngwfcw8ZKfXTrke4dcSa24",
  authDomain: "boardeer.firebaseapp.com",
  projectId: "boardeer",
  storageBucket: "boardeer.firebasestorage.app",
  messagingSenderId: "857930549497",
  appId: "1:857930549497:web:95c5836d19b181e8a87a28"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// 사진(청크 문서)이 시간이 지날수록 계속 쌓이는 구조라, 기본 40MB 캐시 한도로는
// 오래된 사진부터 캐시에서 밀려나 매번 다시 읽어오게 됨. 한도를 없애고 브라우저
// IndexedDB에 계속 쌓아두면 한 번 본 사진은 다음에 다시 안 읽어와도 돼서,
// 방문자나 사진이 늘어나도 "그 사람이 실제로 새로 보는 것"만큼만 읽기가 늘어남.
db.settings({ cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED });
// 같은 브라우저에서 탭을 여러 개 열어도(예: 확인용으로 새 탭을 띄우는 경우) 캐시를
// 탭끼리 공유하도록 synchronizeTabs를 켜둠. 오래되었거나 지원 안 하는 브라우저에서
// 실패해도 캐시 없이 예전처럼 동작하니 조용히 넘어감.
db.enablePersistence({ synchronizeTabs: true }).catch(()=>{});

// 아직 실제 값으로 안 바꾸고 자리표시자가 남아있는지 확인
const FIREBASE_NOT_CONFIGURED = firebaseConfig.apiKey.includes('여기에');
