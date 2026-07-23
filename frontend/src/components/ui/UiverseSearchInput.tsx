import { useState } from 'react';
import './UiverseSearchInput.css';

interface UiverseSearchInputProps {
    placeholder?: string;
    onInputChange?: (value: string) => void;   // 打字触发
    onActionExecute?: (value: string) => void; // 回车/点击触发
    onFocus?: () => void;                      // 聚焦触发
}

export function UiverseSearchInput({ placeholder = "Type to search...", onInputChange, onActionExecute, onFocus }: UiverseSearchInputProps) {
    const [localVal, setLocalVal] = useState("");

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setLocalVal(val);
        if (onInputChange) onInputChange(val);
    };

    // 💥 纯粹的键盘回车事件
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && localVal.trim() !== '') {
            if (onActionExecute) onActionExecute(localVal.trim());
        }
    };

    // 💥 纯粹的放大镜点击事件
    const handleIconClick = () => {
        if (localVal.trim() !== '') {
            if (onActionExecute) onActionExecute(localVal.trim());
        }
    };

    return (
        <div className="container">
            <input
                type="text"
                className="input"
                required
                placeholder={placeholder}
                value={localVal}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onFocus={onFocus}
            />
            <div className="icon" onClick={handleIconClick}>
                <svg xmlns="http://www.w3.org/2000/svg" className="ionicon" viewBox="0 0 512 512">
                    <title>Search</title>
                    <path d="M221.09 64a157.09 157.09 0 10157.09 157.09A157.1 157.1 0 00221.09 64z" fill="none" stroke="currentColor" strokeMiterlimit="10" strokeWidth="32"></path>
                    <path fill="none" stroke="currentColor" strokeLinecap="round" strokeMiterlimit="10" strokeWidth="32" d="M338.29 338.29L448 448"></path>
                </svg>
            </div>
        </div>
    );
}