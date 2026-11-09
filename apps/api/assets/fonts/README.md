# Phông chữ nhúng vào bản xuất PDF / SVG

Bản đầy đủ (không chia nhỏ theo bảng chữ như bản web) để có đủ dấu tiếng Việt khi nhúng vào file.

| File | Nguồn | Giấy phép |
| --- | --- | --- |
| `BeVietnamPro-Regular.ttf`, `BeVietnamPro-SemiBold.ttf` | github.com/google/fonts — `ofl/bevietnampro` | SIL OFL 1.1 (`OFL-BeVietnamPro.txt`) |
| `Alegreya-Regular.ttf`, `Alegreya-Medium.ttf` | Tạo từ `ofl/alegreya/Alegreya[wght].ttf` (google/fonts) bằng fontTools: `python3 -m fontTools.varLib.instancer Alegreya[wght].ttf wght=400 --static --update-name-table` (và `wght=500`). Bản biến thiên khi cắt bộ con bị trình duyệt từ chối trong SVG nên dùng bản tĩnh. | SIL OFL 1.1 (`OFL-Alegreya.txt`, không có tên phông dành riêng) |
