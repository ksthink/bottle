// 편지에 연락처(주소, 전화번호, SNS 아이디 등)가 들어 있는지 본다. 시제품 수준의 간단한 정규식이다.
// 5단계에서 금칙어 목록과 함께 서버 판정으로 옮긴다.
const CONTACT = [
  /https?:\/\/|www\./i,
  /\b[\w-]+\.(com|net|kr|org|io|me)\b/i,
  /\d{2,4}[-\s.]?\d{3,4}[-\s.]?\d{4}/,
  /@[\w.]{2,}/,
  /카톡|카카오톡|인스타|텔레그램|디스코드|오픈채팅|디엠|전화번호|연락처/,
];

export function hasContact(text) {
  return CONTACT.some((re) => re.test(text));
}
