# C++ / CMake Build & Test

Compiles C++ code using CMake and executes automated testing via ctest. Needs CMake 3.21 or later.

```groovy
pipeline {
    agent any
    stages {
        stage('Configure') {
            steps {
                sh 'cmake -S . -B build -DCMAKE_BUILD_TYPE=Release'
            }
        }
        stage('Build') {
            steps {
                // getconf works on linux and macos agents; nproc is linux-only
                sh '''
                    cmake --build build \
                      --config Release \
                      --parallel "$(getconf _NPROCESSORS_ONLN)"
                '''
            }
        }
        stage('Test') {
            steps {
                sh '''
                    ctest --test-dir build \
                      --build-config Release \
                      --output-on-failure \
                      --output-junit ctest-results.xml
                '''
            }
            post {
                always {
                    // --output-junit writes relative to the test dir
                    junit 'build/ctest-results.xml'
                }
            }
        }
    }
}
```

`--config` and `--build-config` only matter for multi-config generators (Visual Studio, Xcode, Ninja Multi-Config); single-config generators take the build type from the configure step.

## Sanitizer build

AddressSanitizer and UndefinedBehaviorSanitizer catch memory errors and undefined behaviour that a release build lets through. They need their own build tree, so build it in parallel with the release tree. This replaces the `Build` and `Test` stages above; `Configure` stays as it is.

```groovy
stage('Build & Test') {
    parallel {
        stage('Release') {
            steps {
                sh '''
                    cmake --build build \
                      --parallel "$(getconf _NPROCESSORS_ONLN)"
                '''
                sh '''
                    ctest --test-dir build \
                      --output-on-failure \
                      --output-junit ctest-results.xml
                '''
            }
            post {
                always {
                    junit 'build/ctest-results.xml'
                }
            }
        }
        stage('ASan + UBSan') {
            environment {
                UBSAN_OPTIONS = 'print_stacktrace=1'
            }
            steps {
                // no-sanitize-recover makes ubsan findings fail the test instead of only printing
                sh '''
                    cmake -S . -B build-asan \
                      -DCMAKE_BUILD_TYPE=RelWithDebInfo \
                      -DCMAKE_C_FLAGS="-fsanitize=address,undefined -fno-sanitize-recover=all -fno-omit-frame-pointer" \
                      -DCMAKE_CXX_FLAGS="-fsanitize=address,undefined -fno-sanitize-recover=all -fno-omit-frame-pointer"
                '''
                sh '''
                    cmake --build build-asan \
                      --parallel "$(getconf _NPROCESSORS_ONLN)"
                '''
                sh '''
                    ctest --test-dir build-asan \
                      --output-on-failure \
                      --output-junit ctest-results.xml
                '''
            }
            post {
                always {
                    junit 'build-asan/ctest-results.xml'
                }
            }
        }
    }
}
```

CMake passes `CMAKE_<LANG>_FLAGS` to the link step as well, so the sanitizer runtimes are linked without extra linker flags. Both branches compile on every core at once; on a small agent, halve the `--parallel` value in each. See [parallel execution](../fundamentals/parallel-execution.md) for how parallel stages behave.

## ccache

ccache returns cached object files for unchanged translation units. CMake hands the compiler command to it through the compiler launcher variables, which work with the Makefile and Ninja generators.

```groovy
environment {
    // outside the workspace, so the cache survives workspace cleanup
    CCACHE_DIR = "${env.HOME}/.cache/ccache"
    // rewrites absolute paths under the workspace, so different branches share hits
    CCACHE_BASEDIR = "${env.WORKSPACE}"
    CCACHE_MAXSIZE = '5G'
}
```

```groovy
stage('Configure') {
    steps {
        sh '''
            cmake -S . -B build \
              -DCMAKE_BUILD_TYPE=Release \
              -DCMAKE_C_COMPILER_LAUNCHER=ccache \
              -DCMAKE_CXX_COMPILER_LAUNCHER=ccache
        '''
    }
}
```

Run `ccache --show-stats` after the build to see the hit rate. ccache must be installed on the agent (`brew install ccache` on macOS, the distro package on Linux).

## clang-tidy

clang-tidy needs the exact compile flags for each file, which CMake writes to `build/compile_commands.json` when `CMAKE_EXPORT_COMPILE_COMMANDS` is on.

```groovy
stage('Configure') {
    steps {
        sh '''
            cmake -S . -B build \
              -DCMAKE_BUILD_TYPE=Release \
              -DCMAKE_EXPORT_COMPILE_COMMANDS=ON
        '''
    }
}
stage('clang-tidy') {
    steps {
        // checks come from .clang-tidy; WarningsAsErrors there decides what fails the stage
        sh '''
            run-clang-tidy \
              -p build \
              -quiet \
              > clang-tidy.log
        '''
    }
    post {
        always {
            // warnings next generation plugin
            recordIssues(tools: [clangTidy(pattern: 'clang-tidy.log')])
        }
    }
}
```

The other option is `-DCMAKE_CXX_CLANG_TIDY=clang-tidy` at configure time, which runs clang-tidy on each file as it compiles (Makefile and Ninja generators). That is simpler but slows every build of that tree, so it suits a dedicated lint tree better than the release one. Checks differ between LLVM releases, so pin the LLVM version on the agents; on macOS, `run-clang-tidy` comes with Homebrew's `llvm`, not Xcode. Quality gates on the published issues are covered in [lint & static analysis](static-analysis.md).

## Dependency caching

Both package managers keep built binaries outside the workspace, so pointing them at a persistent agent path avoids rebuilding dependencies on every run.

Conan 2 keeps its cache under `CONAN_HOME` (default `~/.conan2`):

```groovy
environment {
    CONAN_HOME = "${env.HOME}/.conan2"
}
```

```groovy
stage('Dependencies') {
    steps {
        // build=missing only compiles packages that aren't already in the cache
        sh '''
            conan install . \
              --output-folder=build \
              --build=missing \
              --settings=build_type=Release
        '''
    }
}
```

Then configure with `-DCMAKE_TOOLCHAIN_FILE=build/conan_toolchain.cmake`.

vcpkg's binary caching takes its locations from `VCPKG_BINARY_SOURCES`. The `files` provider stores zipped builds in a directory:

```groovy
environment {
    // clear drops the defaults, readwrite lets builds both use and fill the cache
    VCPKG_BINARY_SOURCES = "clear;files,${env.HOME}/.cache/vcpkg-archives,readwrite"
}
```

> [!WARNING]
> The Conan cache doesn't support concurrent use. On agents with more than one executor, give each executor its own cache, for example `CONAN_HOME = "${env.HOME}/.conan2-${env.EXECUTOR_NUMBER}"`. A per-executor home also needs its own remotes and profiles, so run `conan profile detect --exist-ok` before `conan install`.
