# Khởi tạo Web App Lọc Cổ Phiếu Thành Công

Quá trình xây dựng lại toàn bộ ứng dụng từ đầu theo chuẩn quy trình **TDD và Kiến trúc Module** đã hoàn tất.

## Những thay đổi đã thực hiện

### 1. Kiến trúc Code Sạch (`app.js`)
- Tách biệt hoàn toàn phần xử lý logic thuần túy (Pure Functions: `filterReq1`, `filterReq2`, `normalizeSheet1`, v.v.) ra khỏi phần DOM và UI.
- Điều này giúp code dễ dàng được test độc lập và dễ mở rộng hoặc sửa đổi thuật toán về sau.

### 2. Tái cấu trúc Giao diện (`index.html` & `style.css`)
- **UI/UX Cao cấp**: Áp dụng hiệu ứng **Glassmorphism**, độ trong suốt, bóng đổ (shadows) và hiệu ứng phát sáng (neon glows).
- **Trải nghiệm mượt mà**: 
  - Khung tải dữ liệu (Loader Overlay) chuyên nghiệp.
  - Chuyển tab trơn tru với animation (`fade-in`, `scale-up`).
  - Row hover effects tạo cảm giác giống hệt các terminal tài chính thực thụ.
- **Responsive & Layout**: Thiết kế Full-height (100vh), chia rõ Sidebar (Điều hướng) và Main Workspace.

### 3. Tích hợp Test Độc lập (`tests/filter.test.js`)
- Một file script test không phụ thuộc vào framework bên ngoài đã được tạo ra để kiểm thử chuyên sâu cho thuật toán lọc Yêu cầu 1 và Yêu cầu 2.
- Việc này nằm trong quy trình **TDD (Red -> Green -> Refactor)** nhằm đảm bảo logic tính toán đúng 100% trước khi ghép vào giao diện.

## Hướng dẫn Kiểm tra (Manual Verification - `07-review`)

Để duyệt kết quả, bạn vui lòng làm theo các bước sau:

1. Mở thư mục dự án `bo_loc_co_phieu` trên máy tính của bạn.
2. Click đúp vào file [index.html](file:///c:/Users/long.DESKTOP-DCLSBL3/Documents/workspace/bo_loc_co_phieu/index.html) để mở trên trình duyệt (Khuyên dùng Chrome/Edge).
3. **Chức năng cần kiểm tra:**
   - Dữ liệu Top 10 của Yêu cầu 1 và Yêu cầu 2 có hiển thị chính xác không.
   - Bảng Dashboard "Sức mạnh nhóm ngành" có tự động vẽ thanh tiến trình (progress bar) và load cột Ngành / TB(%) đúng hay chưa.
   - Nút "Cấu hình Dữ liệu" có lưu được link và tự động cập nhật bảng không.
   - Thiết kế giao diện đã đủ độ "Pro" như bạn mong muốn chưa.

> [!NOTE]
> Mọi thay đổi đều đã lưu lại trong mã nguồn cục bộ của bạn. Nếu có bất kỳ điều kiện lọc nào cần tinh chỉnh thêm, bạn chỉ cần báo lại với tôi tại cửa sổ chat này.
