// 学生端 API 接口层
export {
  verifyQrCode,
  registerStudent,
  activateStudent,
  fetchStudentProfile,
  fetchStudentAccessRecords,
  fetchStudentPermissions,
} from "./student.api";
export type {
  StudentQrVerifyResponse,
  StudentProfile,
  StudentAccessRecord,
  StudentPermission,
} from "./student.api";
