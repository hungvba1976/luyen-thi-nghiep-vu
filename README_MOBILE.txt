BỘ LUYỆN THI NGHIỆP VỤ — MOBILE OFFLINE TEST V0.1

ĐÂY LÀ BẢN PWA, KHÔNG CÓ SERVER NGHIỆP VỤ / DATABASE.
Sau khi được cài từ một địa chỉ HTTPS và mở thành công lần đầu, toàn bộ chương trình
và ngân hàng 4.967 câu được cache trên điện thoại, có thể dùng khi không có Internet.
Mỗi điện thoại lưu tiến độ riêng trong bộ nhớ trình duyệt.

ANDROID
1. Mở địa chỉ HTTPS của bộ PWA bằng Chrome.
2. Chọn "Cài ứng dụng" / "Thêm vào màn hình chính".
3. Mở biểu tượng Bộ luyện thi một lần khi còn mạng.
4. Sau đó có thể bật chế độ máy bay để thử offline.

IPHONE / IPAD
1. Mở địa chỉ HTTPS bằng Safari.
2. Bấm Chia sẻ.
3. Chọn "Thêm vào Màn hình chính".
4. Mở ứng dụng từ biểu tượng trên màn hình chính một lần khi còn mạng.
5. Sau đó có thể dùng offline.

LƯU Ý QUAN TRỌNG
- iOS và Android yêu cầu PWA/service worker được cài từ HTTPS (hoặc localhost trên chính thiết bị).
  Vì vậy không thể chỉ gửi file ZIP rồi bấm file index.html để có trải nghiệm offline chuẩn trên iPhone.
- Đây KHÔNG phải server ứng dụng. Có thể đặt các file này lên một dịch vụ static HTTPS đơn giản
  chỉ để phân phối/cài đặt (GitHub Pages, Cloudflare Pages, Netlify...).
- Sau khi cài, logic luyện thi, thi thử, câu hỏi và tiến độ chạy/lưu ngay trên điện thoại.
- Xóa dữ liệu website/app hoặc gỡ PWA có thể xóa tiến độ cục bộ.
- Bản test chưa có tài khoản; mỗi máy là một người dùng độc lập.

CHỨC NĂNG
- 18 ngân hàng, 4.967 câu.
- Luyện tập theo thứ tự/ngẫu nhiên.
- Xáo trộn phương án; giữ thứ tự với câu phụ thuộc "đáp án 1/2/3/4".
- Trạng thái câu, đánh dấu, chấm/khóa trong luyện tập.
- Thi thử 100 câu theo cơ cấu A/B/C.
- 45 phút; hết giờ tự nộp.
- Thi thử được đổi đáp án trước khi nộp.
- Thanh 100 câu bấm trực tiếp để chuyển câu.
- Lưu tiến độ offline bằng localStorage.

KIỂM TRA TRÊN MÁY TÍNH
Có thể chạy:
    python serve_local.py
sau đó mở:
    http://localhost:8080

Lưu ý: máy tính localhost dùng được service worker. Điện thoại truy cập IP LAN qua HTTP
không phải môi trường HTTPS chuẩn để cài PWA offline.

CẤU TRÚC
index.html
app.js
styles.css
sw.js
manifest.webmanifest
icon-192.png
icon-512.png
data/banks.json
