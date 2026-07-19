// ⚠️ 이 파일은 본인의 Firebase 프로젝트 설정으로 반드시 교체해야 합니다.
// 설정 방법은 함께 드린 "설정가이드.md" 문서를 참고하세요.
// Firebase 콘솔 > 프로젝트 설정 > 일반 > "내 앱" 에서 그대로 복사해서 붙여넣으면 됩니다.

const firebaseConfig = {
  apiKey: "여기에_API_KEY",
  authDomain: "여기에_프로젝트ID.firebaseapp.com",
  projectId: "여기에_프로젝트ID",
  storageBucket: "여기에_프로젝트ID.appspot.com",
  messagingSenderId: "여기에_숫자",
  appId: "여기에_앱ID"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
