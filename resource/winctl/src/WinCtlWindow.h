#ifndef NATIVE_EXTENSION_GRAB_W
#define NATIVE_EXTENSION_GRAB_W

#include <nan.h>
#include <windows.h>

class Window : public Nan::ObjectWrap {
public:
	static NAN_MODULE_INIT(Init);
	static NAN_METHOD(GetActiveWindow2);
	static NAN_METHOD(EnumerateWindows);
	static NAN_METHOD(WindowFromPoint2);
	static NAN_METHOD(NonActiveWindowFromPoint);

	static Nan::Persistent<v8::Function> constructor;

private:
	explicit Window(HWND handle);
	~Window();

	static NAN_METHOD(New);

	static NAN_METHOD(getTitle);
	static NAN_METHOD(getHwnd);
	static NAN_METHOD(getClassName);

	static NAN_METHOD(getWindowLongPtr);

	static NAN_METHOD(setForegroundWindow);
	static NAN_METHOD(setForegroundWindowEx);
	static NAN_METHOD(getWindowModuleFileName);
	static NAN_METHOD(setActiveWindow);
	static NAN_METHOD(setWindowPos);
	static NAN_METHOD(moveTop);
	static NAN_METHOD(setWindowLongPtr);
	static NAN_METHOD(setWindowLongPtrRestore);
	static NAN_METHOD(setWindowLongPtrParent);
	static NAN_METHOD(setWindowLongPtrParentRestore);
	static NAN_METHOD(setWindowLongPtrEx);
	static NAN_METHOD(setWindowLongPtrExRestore);
	static NAN_METHOD(setParent);

	static NAN_METHOD(showWindow);
	static NAN_METHOD(move);
//	static NAN_METHOD(move2);
	static NAN_METHOD(moveRelative);
	static NAN_METHOD(dimensions);

    static NAN_METHOD(createWindow);
    static NAN_METHOD(destroyWindow);

	HWND windowHandle;
};

#endif