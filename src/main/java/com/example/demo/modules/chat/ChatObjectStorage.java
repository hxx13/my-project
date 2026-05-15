package com.example.demo.modules.chat;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;

public interface ChatObjectStorage {

    void put(String storageKey, byte[] content) throws IOException;

    InputStream openStream(String storageKey) throws IOException;

    boolean exists(String storageKey);
}
