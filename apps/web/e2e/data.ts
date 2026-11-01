/** Tài khoản do luồng desktop tạo; luồng mobile dùng lại. Chỉ là dữ liệu test. */
export const OWNER = { name: "Lê Văn Quản", email: "truongho@e2e.test", password: "matkhau-e2e-123" };
export const node = (name: string) => `[data-person-id][aria-label^="${name},"]`;
