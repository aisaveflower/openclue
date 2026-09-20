# Notice

This repository is a fork of [opencode](https://github.com/anomalyco/opencode), which is
distributed under the MIT License:

```
MIT License

Copyright (c) 2025 opencode

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Our changes (`git diff a3647eb0..openclue`) are derivative works of that software and are
provided under the same terms.

## Third-party dependencies in distributed binaries

Binaries built from this repository bundle upstream opencode's dependencies. Ship their
license texts with any binary you distribute. Two are worth checking before a commercial
release: `@img/sharp-win32-x64` (Apache-2.0 AND LGPL-3.0-or-later — LGPL obligations apply to
binary distribution) and `@sentry/cli*` (`FSL-1.1-MIT`, which restricts competing use and is
only needed at build time, so keep it out of the artifact).

## Trademarks

The MIT License grants rights to the code only. It does not grant any right to the
"opencode" name or logo, which belong to their owner. This fork therefore uses a separate
name, does not use the opencode logo, and refers to opencode only descriptively
("a fork of opencode", "unofficial"). Do not present builds as official opencode releases.
