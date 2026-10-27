# Đọc Phiếu Xét Nghiệm

Ứng dụng web cài được trên điện thoại (PWA) giúp người dân **hiểu** kết quả xét nghiệm: chụp ảnh phiếu hoặc nhập tay, app giải thích ý nghĩa 56 chỉ số máu, nước tiểu, nội tiết.

> Phần mềm **không chẩn đoán**. Kết quả chỉ để tham khảo, phải đối chiếu phiếu gốc và ý kiến bác sĩ.
> Toàn bộ ngưỡng, giá trị báo động, tổ hợp suy luận và lời khuyên **chưa được chuyên gia y tế rà soát**.

Trang web: https://hodatlsk34-art.github.io/docxetnghiem/

## Chức năng

- **Chụp ảnh phiếu → tự đọc chỉ số** (nhận dạng chữ chạy ngay trên máy bằng Tesseract.js, ảnh không gửi đi đâu). Có màn hình xác nhận: mục đáng ngờ (mất dấu thập phân, khác đơn vị) không được chọn sẵn.
- Nhập tay có tìm kiếm, thêm cả nhóm, nhập **ngưỡng in trên phiếu** (được ưu tiên khi phân loại).
- Kết quả: tổng quan, cảnh báo khẩn cấp, đọc kết hợp các chỉ số, bộ lọc, chi tiết từng chỉ số (Giải thích / Liên quan / Cần lưu ý).
- Tra cứu theo tên tiếng Việt, ký hiệu, tên tiếng Anh; lọc theo nhóm.
- Lịch sử trên trình duyệt, so sánh diễn biến một chỉ số, in / lưu PDF.
- Hoạt động ngoại tuyến, thông báo khi có bản mới.

## Cấu trúc

| Tệp | Trách nhiệm |
| --- | --- |
| `index.html` | Khung trang, CSP |
| `css/styles.css` | Màu, chữ, bố cục responsive, in ấn |
| `js/main.js` | Khởi động |
| `js/app.js` | Giao diện, điều hướng, sự kiện |
| `js/dom.js` | Tạo phần tử an toàn (không `innerHTML` với dữ liệu) |
| `js/validation.js` | Kiểm tra số, đơn vị, ngưỡng phiếu |
| `js/classification.js` | Phân loại, tổ hợp chỉ số |
| `js/storage.js` | localStorage có schema, chuyển dữ liệu bản cũ |
| `js/ocr.js` | Xử lý ảnh, nhận dạng, tách chỉ số |
| `data/tests.json` | Nguồn dữ liệu duy nhất (ngưỡng, giải thích, nguồn tham khảo) |
| `sw.js` | Cache ngoại tuyến có phiên bản |
| `tests/` | Kiểm thử đơn vị và đầu-cuối |

## Kiểm thử

```bash
npm install
npm test                 # kiểm thử đơn vị: số liệu, phân loại, lưu trữ, OCR, XSS
npm run test:e2e         # trình duyệt thật (cần Playwright + Chromium)
TESSERACT_LOCAL=... npm run test:e2e   # kèm kiểm thử chụp ảnh với bộ nhận dạng cài sẵn
```

## Phát hành và quay lại bản cũ

1. Làm trên nhánh riêng, mở Pull Request, kiểm thử tự động phải đạt.
2. Tăng `VERSION` trong `sw.js` và `APP_VERSION` trong `js/app.js` mỗi lần phát hành.
3. Hợp nhất vào `main` → GitHub Pages tự cập nhật sau 1–2 phút. Người đã cài sẽ thấy thông báo "Đã có phiên bản mới".
4. Quay lại bản trước: trên GitHub mở commit hợp nhất → **Revert**, hoặc `git revert <commit>` rồi đẩy lên `main`.

## Việc cần chuyên gia

- [ ] Rà soát khoảng tham chiếu, giá trị báo động trong `data/tests.json`
- [ ] Rà soát 13 tổ hợp trong `js/classification.js` (`RULES`)
- [ ] Bác sĩ nhi, bác sĩ sản rà soát ngưỡng trẻ em / thai phụ (`special` trong `data/tests.json`)
- [ ] Cân nhắc bổ sung ngưỡng theo tuổi cho bạch cầu, tiểu cầu, creatinin, ALP
- [ ] Ghi tên người rà soát và ngày vào `review` trong `data/tests.json`
