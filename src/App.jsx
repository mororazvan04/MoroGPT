import { useState, useRef, useEffect } from 'react'
import './App.css'

import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'

function App() {
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedImage, setSelectedImage] = useState(null);

    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);
    const textareaRef = useRef(null);
    const abortControllerRef = useRef(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
        }
    }, [input]);

    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => setSelectedImage(reader.result);
            reader.readAsDataURL(file);
        }
    };

    const clearChat = () => {
        if (window.confirm("Ștergi conversația?")) {
            setMessages([]);
            setSelectedImage(null);
            setInput('');
            if (abortControllerRef.current) abortControllerRef.current.abort();
            setIsLoading(false);
        }
    };

    const cleanThinkTags = (text) => {
        return text.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trim();
    };

    const stopGeneration = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            setIsLoading(false);
        }
    };

    const sendMessage = async () => {
        if ((!input.trim() && !selectedImage) || isLoading) return;

        const userMessage = { sender: 'user', text: input, image: selectedImage, id: Date.now() };
        const newMessages = [...messages, userMessage];

        setMessages(newMessages);
        setInput('');
        setSelectedImage(null);
        setIsLoading(true);

        if (textareaRef.current) textareaRef.current.style.height = 'auto';

        setMessages((prev) => [...prev, { sender: 'ai', text: '', id: Date.now() + 1 }]);
        abortControllerRef.current = new AbortController();

        try {
            const apiMessages = [
                { role: "system", content: "You are a helpful AI assistant. Use LaTeX for math: $E=mc^2$ for inline or $$...$$ for blocks." },
                ...newMessages.map(m => {
                    if (m.sender === 'user' && m.image) {
                        return {
                            role: 'user',
                            content: [
                                { type: "text", text: m.text || "Describe this." },
                                { type: "image_url", image_url: { url: m.image } }
                            ]
                        };
                    }
                    return { role: m.sender === 'user' ? 'user' : 'assistant', content: m.text };
                })
            ];

            const response = await fetch('http://localhost:1234/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: abortControllerRef.current.signal,
                body: JSON.stringify({
                    model: "local-model",
                    messages: apiMessages,
                    temperature: 0.7,
                    stream: true
                })
            });

            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let fullAiResponse = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const dataStr = line.slice(6).trim();
                        if (dataStr === '[DONE]') break;

                        try {
                            const data = JSON.parse(dataStr);
                            if (data.choices && data.choices[0].delta.content) {
                                fullAiResponse += data.choices[0].delta.content;
                                setMessages((prev) => {
                                    const updatedMessages = [...prev];
                                    updatedMessages[updatedMessages.length - 1].text = cleanThinkTags(fullAiResponse);
                                    return updatedMessages;
                                });
                            }
                        } catch (e) {}
                    }
                }
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                setMessages((prev) => {
                    const updatedMessages = [...prev];
                    updatedMessages[updatedMessages.length - 1].text = "Eroare de conexiune.";
                    return updatedMessages;
                });
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!isLoading) sendMessage();
        }
    };

    return (
        <div className="app-wrapper">
            <header className="chat-header">
                <div className="header-left">
                    <div className="status-dot"></div>
                    <h1>MoroGPT</h1>
                </div>
                {messages.length > 0 && (
                    <button className="clear-chat-btn" onClick={clearChat}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                )}
            </header>

            <div className="chat-container">
                <div className="messages-area">
                    {messages.length === 0 && (
                        <div className="empty-state">
                            <p>AI Chatbot using LM Studio. Secured running locally.</p>
                        </div>
                    )}

                    {messages.map((msg) => (
                        <div key={msg.id} className={`message-row ${msg.sender}`}>
                            <div className="message-content">
                                <div className="message-bubble">
                                    {msg.image && <img src={msg.image} alt="Upload" className="chat-image" />}

                                    <ReactMarkdown
                                        remarkPlugins={[remarkMath]}
                                        rehypePlugins={[rehypeKatex]}
                                    >
                                        {msg.text}
                                    </ReactMarkdown>

                                    {isLoading && msg.sender === 'ai' && !msg.text && (
                                        <div className="loading-dots"><span className="dot"></span><span className="dot"></span><span className="dot"></span></div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>

                <div className="input-area-wrapper">
                    {selectedImage && (
                        <div className="image-preview-container">
                            <img src={selectedImage} alt="Preview" className="image-preview" />
                            <button className="remove-image-btn" onClick={() => setSelectedImage(null)}>✕</button>
                        </div>
                    )}
                    <div className="input-box">
                        <input type="file" accept="image/*" ref={fileInputRef} style={{ display: 'none' }} onChange={handleImageUpload} />
                        <button className="attach-btn" onClick={() => fileInputRef.current.click()}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
                        </button>
                        <textarea ref={textareaRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Scrie o întrebare..." rows="1" />
                        {isLoading ? (
                            <button onClick={stopGeneration} className="send-btn stop-btn active">
                                <svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="1"></rect></svg>
                            </button>
                        ) : (
                            <button onClick={sendMessage} disabled={!input.trim() && !selectedImage} className={`send-btn ${(input.trim() || selectedImage) ? 'active' : ''}`}>
                                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" /></svg>
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default App