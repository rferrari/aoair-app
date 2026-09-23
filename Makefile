.PHONY: help setup install start run-android build-eas test typecheck clean

help:
	@echo "BOAR - Best Offline AI Researcher"
	@echo "-----------------------------------"
	@echo "make setup        - Install npm dependencies"
	@echo "make start        - Start Expo dev server"
	@echo "make run-android  - Build & run on connected Android device"
	@echo "make build-eas    - Build APK via Expo EAS Cloud"
	@echo "make test         - Run unit tests"
	@echo "make typecheck    - Run TypeScript type checking"
	@echo "make clean        - Remove generated native folders & build caches"

setup:
	npm install

install: setup

start:
	npx expo start

run-android:
	npx expo prebuild -p android
	npx expo run:android

build-eas:
	npx eas-cli build --platform android --profile preview

test:
	npm test

typecheck:
	npm run typecheck

clean:
	rm -rf android .expo node_modules
	npm cache clean --force
