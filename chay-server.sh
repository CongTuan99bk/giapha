#!/bin/sh
# Chạy server Gia Phả Cội Nguồn (macOS / Linux):  ./chay-server.sh mau | that | that-khong-link
# Cần: Docker đang chạy, Node.js và pnpm (xem docs/TRIEN-KHAI.md).
set -e
cd "$(dirname "$0")"
case "${1:-}" in
  mau) exec pnpm server --mau ;;
  that) exec pnpm server --that ;;
  that-khong-link) exec pnpm server --that --khong-link ;;
  *)
    echo "Dùng: ./chay-server.sh mau              dữ liệu mẫu (giả), xoá làm lại mỗi lần"
    echo "      ./chay-server.sh that             dữ liệu thật, sao lưu rồi chạy bản mới nhất"
    echo "      ./chay-server.sh that-khong-link  dữ liệu thật, chỉ xem trên máy này"
    exit 1 ;;
esac
