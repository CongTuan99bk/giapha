#!/bin/sh
# Chạy server Gia Phả Cội Nguồn (macOS / Linux):  ./chay-server.sh mau | that | that-khong-link | that-tailscale | that-cloudflare
# Cần: Docker đang chạy, Node.js và pnpm (xem docs/TRIEN-KHAI.md).
set -e
cd "$(dirname "$0")"
case "${1:-}" in
  mau) exec pnpm chay --mau ;;
  that) exec pnpm chay --that ;;
  that-khong-link) exec pnpm chay --that --khong-link ;;
  that-tailscale) exec pnpm chay --that --tailscale ;;
  that-cloudflare) exec pnpm chay --that --cloudflare ;;
  *)
    echo "Dùng: ./chay-server.sh mau              dữ liệu mẫu (giả), xoá làm lại mỗi lần"
    echo "      ./chay-server.sh that             dữ liệu thật, sao lưu rồi chạy bản mới nhất"
    echo "      ./chay-server.sh that-khong-link  dữ liệu thật, chỉ xem trên máy này"
    echo "      ./chay-server.sh that-tailscale   dữ liệu thật, link cố định qua Tailscale (lần sau 'that' dùng luôn)"
    echo "      ./chay-server.sh that-cloudflare  dữ liệu thật, quay lại link tạm Cloudflare"
    exit 1 ;;
esac
