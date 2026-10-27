# Nhật ký thay đổi

## 2.0.0 — 27/10/2026

**Mới**
- Chụp ảnh / chọn ảnh phiếu (nhiều trang) → tự đọc chỉ số, giá trị, đơn vị, ngưỡng in trên phiếu, giới tính; màn hình xác nhận trước khi thêm.
- Giao diện mới theo mẫu: Trang chủ, Đọc phiếu, Kết quả, Chi tiết, Tra cứu, Lịch sử, Hướng dẫn, Cài đặt; thanh điều hướng dưới; hai cột trên máy tính; chế độ tối.
- Ngưỡng trên phiếu, đối tượng (người lớn / trẻ em / mang thai), lịch sử và so sánh, in / lưu PDF.

**An toàn & bảo mật (P0)**
- Bỏ toàn bộ `innerHTML` với dữ liệu; thêm Content-Security-Policy.
- localStorage: schema bản 2, kiểm tra kiểu và khóa, xử lý JSON hỏng, hết dung lượng, chế độ ẩn danh; tự chuyển dữ liệu bản 1.

**Độ đúng (P1)**
- Kiểm tra số chặt: từ chối `5abc`, số âm, số mũ, NaN, Infinity; chặn nhầm đơn vị phổ biến (g/dL, mg/dL, /µL, NEU%).
- Không gộp ngưỡng nam/nữ khi chưa chọn giới tính → "Chưa đủ thông tin".
- Diễn đạt tổ hợp thận trọng ("cần bác sĩ xác nhận"); chỉ xét tổ hợp khi đủ dữ liệu; nêu phạm vi đã phân tích.
- Không đổi ngưỡng y khoa so với bản 1; thêm nguồn tham khảo và trạng thái "chưa rà soát".

**PWA**
- Service worker có phiên bản, mạng trước cho mã nguồn, thông báo cập nhật, chỉ xóa cache của app.
