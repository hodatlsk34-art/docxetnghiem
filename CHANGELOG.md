# Nhật ký thay đổi

## 2.4.0 — 27/10/2026
- **Tải file kết quả**: PDF bệnh viện gửi (đọc trực tiếp chữ, kể cả phiếu in hai cột và tên xét nghiệm xuống dòng), PDF dạng scan (tự nhận dạng chữ), ảnh, Excel, CSV, TXT; chọn nhiều file; kéo thả trên máy tính.
- **Chia sẻ file từ Zalo/Gmail/Tệp vào app** (Android, app đã cài).
- **Tự cập nhật**: bản mới kích hoạt ngay, app tự tải lại ở thời điểm an toàn (không khi đang nhập hay đang đọc file) và báo "Đã cập nhật"; kiểm tra bản mới mỗi khi mở lại app.
- Bỏ dòng tỷ lệ % của công thức bạch cầu, bỏ dòng tiêu đề bảng khi đọc phiếu.

## 2.3.0 — 27/10/2026
- **Đọc liên kết theo 9 nhóm**: hồng cầu & thiếu máu, bạch cầu & viêm, đường huyết, mỡ máu, gan mật, thận & điện giải, tuyến giáp, nước tiểu, miễn dịch viêm gan B. Mỗi nhóm có mức độ, mẫu hình gợi ý, chỉ số tính thêm, xét nghiệm bác sĩ có thể cân nhắc.
- **Chỉ số tính thêm có nguồn**: Mentzer, eGFR CKD-EPI 2021 (cần nhập tuổi), urê/creatinin, canxi hiệu chỉnh, De Ritis, non-HDL, tỷ lệ Cholesterol/HDL, LDL Friedewald, đường huyết trung bình ước tính, mức tăng men gan theo ACG.
- **Kiểm tra số liệu không khớp** (MCV–HCT–RBC, MCH, MCHC, tổng bạch cầu, HDL/LDL/Cholesterol, bilirubin, albumin/protein) ở màn kết quả và ngay khi xác nhận ảnh.
- Tab "Liên quan" ở chi tiết chỉ số hiển thị nhóm đọc liên kết. Thêm ô tuổi cho người lớn.

## 2.2.0 — 27/10/2026
- Ngưỡng riêng cho **trẻ em** theo nhóm tuổi: Hb (WHO 2024), cholesterol, LDL, triglycerid, HDL (NHLBI 2011); đường huyết, HbA1c dùng tiêu chuẩn ADA như người lớn.
- Ngưỡng riêng cho **thai phụ** theo giai đoạn: Hb (WHO 2024), đường huyết đói 5,1 mmol/L (IADPSG), TSH ≤ 4,0 mU/L (ATA 2017); HbA1c và mỡ máu ghi "Không áp dụng".
- Chọn nhóm tuổi / giai đoạn thai kỳ ở màn Đọc phiếu; ảnh phiếu có năm sinh dưới 18 tuổi → gợi ý áp dụng ngưỡng trẻ em.
- Chỉ số thay đổi nhiều theo tuổi/tháng thai (bạch cầu, tiểu cầu, men gan, creatinin…) vẫn cần ngưỡng in trên phiếu.
- Không cảnh báo giá trị báo động của người lớn cho trẻ dưới 6 tháng.

## 2.1.0 — 27/10/2026
- Thẻ "Cài app lên điện thoại" ở trang chủ: nút "Cài đặt ngay" trên Android/máy tính; hướng dẫn từng bước cho iPhone; nhận biết khi mở trong Zalo/Facebook/Messenger và hướng dẫn mở bằng trình duyệt.
- Hướng dẫn cài trong mục Hướng dẫn và Cài đặt; tự ẩn khi đã chạy như app.
- Cảm giác như ứng dụng: tắt kéo-để-tải-lại, không chọn nhầm chữ khi chạm, hiệu ứng nhấn, thanh tiêu đề cố định khi chạy như app.
- Manifest: ảnh giới thiệu cho hộp thoại cài (Android), khóa màn hình dọc.

## 2.0.1 — 27/10/2026
- Menu có ô màu riêng cho từng mục, chữ đậm cùng màu.

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
