import { Link } from 'react-router-dom';
import '@/styles/home.scss';

function Home() {
  return (
    <section className="home" id="home">
      <div className="background-wrapper">
        <div className="wrapper-img"></div>
        <div className="wrapper-blur"></div>
        <div className="wrapper-color"></div>
      </div>
    </section>
  );
}

export default Home;
