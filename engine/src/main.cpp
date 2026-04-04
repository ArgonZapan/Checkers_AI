#include "httplib.h"
#include <iostream>
#include <cstdlib>

void setupServer(httplib::Server& svr);

int main() {
    httplib::Server svr;
    setupServer(svr);

    int port = 8080;
    const char* envPort = std::getenv("PORT");
    if (envPort) port = std::atoi(envPort);

    std::cout << "Checkers AI Engine starting on port " << port << "..." << std::endl;
    svr.listen("0.0.0.0", port);
    return 0;
}
