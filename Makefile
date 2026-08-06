push:
	@bash push.sh
deploy:
	@bash deploy.sh
run:
	@pnpm run dev
preview:
	@pnpm build --mode preview && pnpm preview
app:
	@pnpm tauri dev
# 打包成dmg
build:
	@pnpm tauri build