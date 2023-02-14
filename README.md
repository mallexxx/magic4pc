# Magic4PC

Allows you to use the magic remote on your webOS LG TV as a mouse for your PC.

Modified to remove the gear icon and make settings open when 'Guide' is pressed.

# ⚠️THIS VERSION HAS SLEEP DISABLED. Be careful with OLEDs.⚠️

See https://github.com/netham45/magic4pc_altclient for a cross-platform Go client for magic4pc

# Installing

Get the .ipk release from the releases page

To install the .ipk, first install the [webOS TV SDK](https://webostv.developer.lge.com/sdk/installation/download-installer/) on your PC, make sure your TV is [rooted](rootmy.tv) (and ready for ssh: see [here](https://webostv.developer.lge.com/develop/app-test/using-devmode-app#connectingTVandPC) and [here](https://github.com/webosbrew/webos-homebrew-channel/blob/main/README.md#development-tv-setup)) or you have enabled [developer mode](https://webostv.developer.lge.com/develop/app-test/using-devmode-app/), and then install the app from the webOS TV CLI using `ares-install --device YOUR_DEVICE_ID_HERE me.wouterdek.magic4pc_1.0.0_all.ipk`. Find your device id with `ares-install --device-list`.

# Building from source

## The WebOS IPK
* Install Node.js v14.15.1
* Go to `webos/` directory
* Run `npm install` to install dependencies
* Run `npm run build` to build the application
* Run `npm run package` to create ipk (application package)
