# .hmi to .h file

This project allow you to extract pages & component ids from Nextion HMI files and generate associated C/C++ header files (.H)

## using it

node bin/hmi2h.js <input filename.hmi> -o <output filename.h>

ex:
node bin/hmi2h.js example/mk4duo_7_0_intelligent_v1_3_2.HMI -o example/ids.h