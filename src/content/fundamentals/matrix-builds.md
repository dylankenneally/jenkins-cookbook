# Matrix Builds

A `matrix {}` runs the same stages for every combination of a set of axes, in parallel. It replaces hand-written [parallel](parallel-execution.md) branches that only differ by platform or version.

```groovy
pipeline {
    agent none

    stages {
        stage('Test') {
            matrix {
                axes {
                    axis {
                        name 'PLATFORM'
                        values 'linux', 'macos'
                    }
                    axis {
                        name 'NODE_VERSION'
                        values '20', '22'
                    }
                }

                // no macos agent carries node 20 here, so skip that cell rather than queue forever
                excludes {
                    exclude {
                        axis {
                            name 'PLATFORM'
                            values 'macos'
                        }
                        axis {
                            name 'NODE_VERSION'
                            values '20'
                        }
                    }
                }

                // each cell picks an agent from its axis values
                agent {
                    label "${PLATFORM} && node-${NODE_VERSION}"
                }

                stages {
                    stage('Install & Test') {
                        steps {
                            sh 'node --version'
                            sh 'npm ci'
                            sh 'npm test'
                        }
                    }
                }
            }
        }
    }
}
```

That gives three cells: linux/20, linux/22 and macos/22. Inside a cell the axis values are environment variables, so `sh 'echo "$PLATFORM"'` works.

The labels here (`linux`, `macos`, `node-20`, `node-22`) are examples. Use whatever labels your agents carry; see [agents and labels](agents-and-labels.md).

## CMake on Linux and macOS

```groovy
pipeline {
    agent none

    stages {
        stage('Build & Test') {
            matrix {
                axes {
                    axis {
                        name 'PLATFORM'
                        values 'linux', 'macos'
                    }
                    axis {
                        name 'BUILD_TYPE'
                        values 'Debug', 'Release'
                    }
                }

                agent {
                    label "${PLATFORM}"
                }

                stages {
                    stage('Configure') {
                        steps {
                            sh 'cmake -S . -B build -DCMAKE_BUILD_TYPE="$BUILD_TYPE"'
                        }
                    }
                    stage('Build') {
                        steps {
                            // getconf works on linux and macos agents; nproc is linux-only
                            sh '''
                                cmake --build build \
                                  --parallel "$(getconf _NPROCESSORS_ONLN)"
                            '''
                        }
                    }
                    stage('Test') {
                        steps {
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
                }
            }
        }
    }
}
```

The single-platform version of this build is in [C++ / CMake](../builds/cpp-cmake.md).

## Notes

- `excludes` removes combinations. Each `exclude` matches when every axis in it matches; `notValues` inverts an axis, for example to exclude everything except one platform.
- Add `failFast true` inside `matrix` to abort the other cells as soon as one fails. Without it, every cell runs to the end so you see all failures.
- The total cell count grows quickly. Two axes of three values is nine builds, each holding an executor.
- `matrix` accepts the same directives as a stage (`agent`, `environment`, `options`, `when`, `post`, `tools`, `input`) and applies them to every cell.
